package dev.popusk.widgets

enum class WidgetTheme(
    val key: String,
    val background: Int,
    val chip: Int,
    val primary: Int,
    val secondary: Int,
    val tertiary: Int,
    val arcTrack: Int,
) {
    LIGHT(
        "light", R.drawable.widget_bg_light, R.drawable.chip_bg_light,
        0xFF2A2A2A.toInt(), 0xFF8E8E93.toInt(), 0xFF3A3A3C.toInt(), 0xFF9E9EA2.toInt(),
    ),
    DARK(
        "dark", R.drawable.widget_bg_dark, R.drawable.chip_bg_dark,
        0xFFF2F2F4.toInt(), 0xFF8E8E93.toInt(), 0xFFC7C7CC.toInt(), 0xFF5A5A5E.toInt(),
    ),
    GLASS(
        "glass", R.drawable.widget_bg_glass, R.drawable.chip_bg_glass,
        0xFFFFFFFF.toInt(), 0xCCFFFFFF.toInt(), 0xE6FFFFFF.toInt(), 0x99FFFFFF.toInt(),
    );

    companion object {
        fun fromKey(key: String?) = entries.firstOrNull { it.key == key } ?: LIGHT
    }
}
