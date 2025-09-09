using UnityEngine;
using System.Collections.Generic;

public class AfsElement : MonoBehaviour
{
    public enum DisplayMode { VisibilityToggle, Colorize }

    [Header("ID и режим")]
    [SerializeField] private string elementId = "floor1";
    public string ElementId => elementId;
    [SerializeField] private DisplayMode mode = DisplayMode.VisibilityToggle;

    [Header("Порог видимости")]
    [Tooltip("Окно видно, если stage >= этого значения")]
    [SerializeField] private int visibleIfStageAtLeast = 1;

    [Header("Renderer target")]
    [Tooltip("Если пусто — возьмём MeshRenderer на этом объекте.\nЕсли включено 'Affect All Child Renderers' — соберём всех детей.")]
    [SerializeField] private MeshRenderer targetRenderer;
    [SerializeField] private bool affectAllChildRenderers = false;

    [Header("Colorize")]
    [SerializeField] private Color stage0 = new Color(0.75f, 0.75f, 0.75f, 1);
    [SerializeField] private Color stage1 = new Color(1f, 0.92f, 0.23f, 1);
    [SerializeField] private Color stage2 = new Color(0.27f, 0.73f, 0.34f, 1);
    [SerializeField] private Color stage3 = new Color(0.86f, 0.22f, 0.22f, 1);
    [SerializeField] private bool useEmission = true;

    [Header("Отладка")]
    [SerializeField] private bool debugLog = true;

    private readonly List<MeshRenderer> _renderers = new List<MeshRenderer>();

    private static string Norm(string s) => (s ?? "").Trim().ToLowerInvariant();

    private void Awake() => RefreshRenderers();

    private void OnEnable()
    {
        RefreshRenderers();

        // ПОДПИСКА НА СОБЫТИЕ из Watcher
        if (AfsStageWatcher.Instance != null)
            AfsStageWatcher.Instance.OnStageChanged += HandleStageChanged;

        // Применим текущее значение, если вотчер его уже знает
        int stage = 0;
        if (AfsStageWatcher.Instance != null &&
            AfsStageWatcher.Instance.TryGetStage(Norm(elementId), out var s))
            stage = s;

        Apply(stage, "OnEnable");
    }

    private void OnDisable()
    {
        if (AfsStageWatcher.Instance != null)
            AfsStageWatcher.Instance.OnStageChanged -= HandleStageChanged;
    }

    private void HandleStageChanged(string id, int stage)
    {
        if (Norm(id) != Norm(elementId)) return;
        Apply(stage, "event");
    }

    [ContextMenu("AFS/Refresh renderers")]
    private void RefreshRenderers()
    {
        _renderers.Clear();

        if (affectAllChildRenderers)
        {
            var all = GetComponentsInChildren<MeshRenderer>(true);
            _renderers.AddRange(all);
        }
        else if (targetRenderer != null)
        {
            _renderers.Add(targetRenderer);
        }
        else
        {
            var mr = GetComponent<MeshRenderer>();
            if (mr != null) _renderers.Add(mr);
        }

        if (debugLog)
            Debug.Log($"[AFS] {name}: взял под управление {_renderers.Count} MeshRenderer(ов).");
    }

    private void Apply(int stage, string reason)
    {
        if (debugLog)
            Debug.Log($"[AFS] {name} ({elementId}) -> stage={stage}, mode={mode}, thr={visibleIfStageAtLeast} [{reason}]");

        if (mode == DisplayMode.VisibilityToggle)
        {
            bool visible = stage >= visibleIfStageAtLeast;
            foreach (var r in _renderers)
                if (r) r.enabled = visible;

            if (debugLog) Debug.Log($"[AFS] {name}: renderer.enabled={visible}");
        }
        else // Colorize
        {
            var col = stage >= 3 ? stage3 : (stage == 2 ? stage2 : (stage == 1 ? stage1 : stage0));

            foreach (var r in _renderers)
            {
                if (!r) continue;
                var mat = r.material;
                mat.color = col;
                if (useEmission)
                {
                    mat.EnableKeyword("_EMISSION");
                    mat.SetColor("_EmissionColor", col);
                }
            }
        }
    }
}
