using UnityEngine;
using System;
using TMPro;

/// Компонент-приёмник заметки (note + updatedAt) от AfsStageWatcher.
/// ДОЛЖЕН висеть на том же GameObject, где AfsElement.
/// Поле target — это ваш TextMeshPro-объект-ребёнок, куда писать текст.
public class AfsInfoLabel : MonoBehaviour, IAfsInfoReceiver
{
    [Header("Куда писать текст")]
    public TextMeshPro target;                // 3D TextMeshPro (не UGUI)
    [Tooltip("Если заметка пустая — скрывать подпись")]
    public bool hideWhenEmpty = true;

    string lastNote = "";
    long lastUpdated;

    // Автопоиск текста при добавлении компонента
    void Reset()
    {
        if (target == null) target = GetComponentInChildren<TextMeshPro>(true);
    }

    public void SetInfo(string note, long updatedAtUnix)
    {
        lastNote = note ?? "";
        lastUpdated = updatedAtUnix;

        if (target == null) return;

        if (hideWhenEmpty && string.IsNullOrWhiteSpace(lastNote))
        {
            target.gameObject.SetActive(false);
            return;
        }

        target.gameObject.SetActive(true);

        var when = updatedAtUnix > 0 ? UnixToLocalShort(updatedAtUnix) : "";
        // Формат: первая строка — заметка, второй строкой маленьким шрифтом — время
        target.text = string.IsNullOrEmpty(when)
            ? lastNote
            : $"{lastNote}\n<size=70%><color=#888>upd {when}</color></size>";
    }

    string UnixToLocalShort(long ts)
    {
        try
        {
            var dt = DateTimeOffset.FromUnixTimeSeconds(ts).LocalDateTime;
            return dt.ToString("dd.MM HH:mm");
        }
        catch { return ""; }
    }
}
