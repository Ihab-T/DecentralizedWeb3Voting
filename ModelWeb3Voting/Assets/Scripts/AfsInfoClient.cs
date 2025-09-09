using System;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

public static class AfsInfoClient
{
    [Serializable]
    public class InfoDto
    {
        public bool ok;
        public string elementId;
        public int stage;
        public string note;
        public long updatedAt;
        public int version;
    }

    public static async Task<InfoDto> GetInfoAsync(string baseUrl, string normalizedId)
    {
        var url = $"{baseUrl.TrimEnd('/')}/info/{UnityWebRequest.EscapeURL(normalizedId)}";
        using var req = UnityWebRequest.Get(url);
#if UNITY_2020_1_OR_NEWER
        var op = req.SendWebRequest();
        while (!op.isDone) await Task.Yield();
        if (req.result != UnityWebRequest.Result.Success)
            throw new Exception(req.error);
#else
        var op = req.SendWebRequest();
        while (!op.isDone) await Task.Yield();
        if (req.isNetworkError || req.isHttpError)
            throw new Exception(req.error);
#endif
        var json = req.downloadHandler.text;
        return JsonUtility.FromJson<InfoDto>(json);
    }
}
