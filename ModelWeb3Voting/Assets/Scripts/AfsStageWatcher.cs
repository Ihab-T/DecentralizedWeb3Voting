using UnityEngine;
using System;
using System.Threading;
using System.Threading.Tasks;
using System.Collections.Generic;
using UnityEngine.Networking;
using System.Net;
using Nethereum.Web3;
using Nethereum.Util;
using Nethereum.Hex.HexConvertors.Extensions;

[DefaultExecutionOrder(-100)]
public class AfsStageWatcher : MonoBehaviour
{
    public static AfsStageWatcher Instance { get; private set; }

    // ===== Оракул-сервер (REST) =====
    [Header("Оракул-сервер (опционально)")]
    [SerializeField] private bool preferServer = true;
    [SerializeField] private string serverUrl = "http://localhost:8787";
    [Tooltip("Какую сеть спрашивать у REST-сервера: l1 или l2")]
    [SerializeField] private string chain = "l2";

    // ===== RPC (нужно только как запасной вариант для V3/V4) =====
    [Header("RPC и контракт (фоллбек для V3/V4)")]
    [SerializeField] private string rpcUrl = "https://sepolia.infura.io/v3/9d58ecd916c74f18a0caabb39da8e163";
    [SerializeField] private string contractAddress = "0x3181C04dbb8e7BA907832A73B237A6EDf45B9B19"; // proxy V5 — в V5 on-chain вызов не используется
    [TextArea(3, 10)]
    [SerializeField] private string abi = @"[
      { ""inputs"": [{ ""internalType"": ""bytes32"", ""name"": """", ""type"": ""bytes32"" }],
        ""name"": ""stageOf"",
        ""outputs"": [{ ""internalType"": ""uint8"", ""name"": """", ""type"": ""uint8"" }],
        ""stateMutability"": ""view"", ""type"": ""function"" }
    ]";

    // ===== Опрос =====
    [Header("Опрос")]
    [SerializeField, Min(0.25f)] private float pollIntervalSeconds = 2f;
    [SerializeField] private bool debugLog = true;

    private Web3 web3;
    private CancellationTokenSource cts;

    private readonly Dictionary<string, int> stages = new();
    public event Action<string, int> OnStageChanged;

    private void Awake()
    {
        ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;
        if (Instance != null && Instance != this) { Destroy(gameObject); return; }
        Instance = this;

        // RPC может пригодиться для старых версий, но для V5 мы полагаемся на сервер.
        web3 = new Web3(rpcUrl);
    }

    private void OnEnable()
    {
        cts = new CancellationTokenSource();
        _ = RunAsync(cts.Token);
    }

    private void OnDisable()
    {
        cts?.Cancel();
    }

    public bool TryGetStage(string normalizedId, out int stage) =>
        stages.TryGetValue(normalizedId, out stage);

    private async Task RunAsync(CancellationToken token)
    {
        // Проверим RPC (ради информации в логах). Если не ответит — не страшно для V5.
        try
        {
            var net = await web3.Eth.ChainId.SendRequestAsync();
            if (debugLog) Debug.Log($"[AFS] ChainId via RPC = {net}");
        }
        catch (Exception ex)
        {
            if (debugLog) Debug.LogWarning($"[AFS] chainId via RPC failed: {ex.Message}");
        }

        while (!token.IsCancellationRequested)
        {
            try
            {
                AfsElement[] elems;
#if UNITY_2023_1_OR_NEWER
                elems = UnityEngine.Object.FindObjectsByType<AfsElement>(FindObjectsSortMode.None);
#else
                elems = UnityEngine.Object.FindObjectsOfType<AfsElement>();
#endif
                foreach (var e in elems)
                {
                    if (string.IsNullOrWhiteSpace(e.ElementId)) continue;
                    var norm = Normalize(e.ElementId);

                    try
                    {
                        int newStage = 0;
                        string note = null;
                        long updatedAt = 0;

                        if (preferServer)
                        {
                            var info = await FetchInfoFromServer(norm);
                            if (info == null || !info.ok)
                                throw new Exception("info.ok=false");

                            // Если это V5 или сервер не дал stage — считаем его по голосам.
                            if (info.version >= 5 && info.stage < 0)
                            {
                                int s = await GetStageFromVotes(norm);
                                newStage = s;
                            }
                            else
                            {
                                newStage = Mathf.Max(0, info.stage);
                            }

                            note = info.note;
                            updatedAt = info.updatedAt;
                        }
                        else
                        {
                            // Фоллбек для V3/V4. Для V5 этот путь обычно не используется.
                            try
                            {
                                var contract = web3.Eth.GetContract(abi, contractAddress);
                                var fn = contract.GetFunction("stageOf");
                                byte s = await fn.CallAsync<byte>(ToId(norm));
                                newStage = s;
                            }
                            catch
                            {
                                newStage = 0; // на V5 такой функции нет — не считаем это фатальной ошибкой
                            }
                        }

                        if (debugLog) Debug.Log($"[AFS] watcher {norm} -> stage {newStage}");

                        if (!stages.TryGetValue(norm, out var old) || old != newStage)
                        {
                            stages[norm] = newStage;
                            OnStageChanged?.Invoke(norm, newStage);
                        }

                        var rcv = e.GetComponent<IAfsInfoReceiver>();
                        if (rcv != null && !string.IsNullOrEmpty(note))
                            rcv.SetInfo(note, updatedAt);
                    }
                    catch (Exception exCall)
                    {
                        Debug.LogWarning($"[AFS] Watcher call failed for '{norm}': {exCall.Message}");
                    }
                }
            }
            catch (Exception exLoop)
            {
                Debug.LogWarning($"[AFS] Watcher loop error: {exLoop.Message}");
            }

            try { await Task.Delay(TimeSpan.FromSeconds(pollIntervalSeconds), token); }
            catch { /* cancelled */ }
        }
    }

    // ======== REST DTOs ========

    [Serializable]
    private class InfoDto
    {
        public bool ok;
        public string elementId;
        public int stage = -1;            // для V5 сервер может не прислать stage -> оставляем -1
        public string note;
        public long updatedAt;
        public int version;               // у тебя приходит 5
        public string chain;
        public string updatedAtISO;
    }

    [Serializable] private class VotesDto { public bool ok; public Voter[] voters; }
    [Serializable] private class Voter { public string address; public bool voted; }

    // ======== REST helpers ========

    private async Task<InfoDto> FetchInfoFromServer(string normalizedId)
    {
        var baseUrl = serverUrl ?? "";
        var url = $"{baseUrl.TrimEnd('/')}/info/{UnityWebRequest.EscapeURL(normalizedId)}?chain={chain}";

        using var req = UnityWebRequest.Get(url);
        var op = req.SendWebRequest();
        while (!op.isDone) await Task.Yield();

#if UNITY_2020_1_OR_NEWER
        if (req.result != UnityWebRequest.Result.Success)
            throw new Exception(req.error);
#else
        if (req.isNetworkError || req.isHttpError)
            throw new Exception(req.error);
#endif
        var json = req.downloadHandler.text;
        if (debugLog) Debug.Log($"[AFS] REST GET {url}\n{json}");

        InfoDto dto = null;
        try { dto = JsonUtility.FromJson<InfoDto>(json); }
        catch (Exception ex)
        {
            throw new Exception($"JSON parse failed: {ex.Message}\n{json.Substring(0, Math.Min(200, json.Length))}");
        }
        return dto;
    }

    private async Task<int> GetStageFromVotes(string normalizedId)
    {
        var baseUrl = serverUrl ?? "";
        var url = $"{baseUrl.TrimEnd('/')}/v5/votes/{UnityWebRequest.EscapeURL(normalizedId)}?chain={chain}";

        using var req = UnityWebRequest.Get(url);
        var op = req.SendWebRequest();
        while (!op.isDone) await Task.Yield();

#if UNITY_2020_1_OR_NEWER
        if (req.result != UnityWebRequest.Result.Success)
            throw new Exception(req.error);
#else
        if (req.isNetworkError || req.isHttpError)
            throw new Exception(req.error);
#endif
        var json = req.downloadHandler.text;
        if (debugLog) Debug.Log($"[AFS] REST GET {url}\n{json}");

        VotesDto dto = null;
        try { dto = JsonUtility.FromJson<VotesDto>(json); }
        catch (Exception ex)
        {
            throw new Exception($"Votes JSON parse failed: {ex.Message}\n{json.Substring(0, Math.Min(200, json.Length))}");
        }

        if (dto != null && dto.ok && dto.voters != null && dto.voters.Length > 0)
        {
            bool allYes = true;
            foreach (var v in dto.voters) if (!v.voted) { allYes = false; break; }
            return allYes ? 1 : 0;
        }
        return 0;
    }

    // ===== Утилиты =====

    private static byte[] ToId(string s)
    {
        var norm = Normalize(s);
        var hash = new Sha3Keccack().CalculateHash(norm);
        return hash.HexToByteArray();
    }

    private static string Normalize(string s) => (s ?? "").Trim().ToLowerInvariant();
}

public interface IAfsInfoReceiver
{
    void SetInfo(string note, long updatedAtUnix);
}
