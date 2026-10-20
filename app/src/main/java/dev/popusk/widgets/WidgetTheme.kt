package dev.popusk.widgets

/** Палитра: фон светлый / тёмный / стекло. Применяется к любому стилю. */
enum class WidgetTheme(
    val key: String,
    val primary: Int,
    val secondary: Int,
    val tertiary: Int,
    val arcTrack: Int,
    val accent: Int,
) {
    LIGHT("light", 0xFF2A2A2A.toInt(), 0xFF8E8E93.toInt(), 0xFF3A3A3C.toInt(), 0xFF9E9EA2.toInt(), 0xFFD98A2B.toInt()),
    DARK("dark", 0xFFF2F2F4.toInt(), 0xFF8E8E93.toInt(), 0xFFC7C7CC.toInt(), 0xFF5A5A5E.toInt(), 0xFFF2B256.toInt()),
    GLASS("glass", 0xFFFFFFFF.toInt(), 0xCCFFFFFF.toInt(), 0xE6FFFFFF.toInt(), 0x99FFFFFF.toInt(), 0xFFFFC978.toInt());

    companion object {
        fun fromKey(key: String?) = entries.firstOrNull { it.key == key } ?: LIGHT
    }
}

/** Стиль: разметка и форма карточки. */
enum class WidgetStyle(
    val key: String,
    val title: String,
    val clockLayout: Int,
    val activityLayout: Int,
    val weatherLayout: Int,
) {
    ORIGIN("origin", "OriginOS", R.layout.widget_clock, R.layout.widget_activity, R.layout.widget_weather),
    IOS("ios", "iOS 17", R.layout.widget_clock_ios, R.layout.widget_activity_ios, R.layout.widget_weather_ios),
    POPUSK("popusk", "Popusk", R.layout.widget_clock_popusk, R.layout.widget_activity_popusk, R.layout.widget_weather_popusk),
    MONO("mono", "Mono", R.layout.widget_clock_mono, R.layout.widget_activity_mono, R.layout.widget_weather_mono);

    fun background(theme: WidgetTheme): Int = when (this) {
        ORIGIN -> when (theme) {
            WidgetTheme.LIGHT -> R.drawable.widget_bg_light
            WidgetTheme.DARK -> R.drawable.widget_bg_dark
            WidgetTheme.GLASS -> R.drawable.widget_bg_glass
        }
        IOS -> when (theme) {
            WidgetTheme.LIGHT -> R.drawable.bg_ios_light
            WidgetTheme.DARK -> R.drawable.bg_ios_dark
            WidgetTheme.GLASS -> R.drawable.bg_ios_glass
        }
        POPUSK -> when (theme) {
            WidgetTheme.LIGHT -> R.drawable.bg_popusk_light
            WidgetTheme.DARK -> R.drawable.bg_popusk_dark
            WidgetTheme.GLASS -> R.drawable.bg_popusk_glass
        }
        MONO -> when (theme) {
            WidgetTheme.LIGHT -> R.drawable.bg_mono_light
            WidgetTheme.DARK -> R.drawable.bg_mono_dark
            WidgetTheme.GLASS -> R.drawable.bg_mono_glass
        }
    }

    fun chip(theme: WidgetTheme): Int = when (theme) {
        WidgetTheme.LIGHT -> R.drawable.chip_bg_light
        WidgetTheme.DARK -> R.drawable.chip_bg_dark
        WidgetTheme.GLASS -> R.drawable.chip_bg_glass
    }

    companion object {
        fun fromKey(key: String?) = entries.firstOrNull { it.key == key } ?: ORIGIN
    }
}
