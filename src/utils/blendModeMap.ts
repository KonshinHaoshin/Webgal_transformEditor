import * as PIXI from 'pixi.js';

/**
 * 混合模式映射：从字符串名称映射到 PIXI.BLEND_MODES 常量
 * 支持中英文名称和常见的变体
 */
export const BLEND_MODE_MAP: Record<string, number> = {
    // 正常模式
    'normal': PIXI.BLEND_MODES.NORMAL,
    '正常': PIXI.BLEND_MODES.NORMAL,
    'none': PIXI.BLEND_MODES.NORMAL,
    
    // 溶解 - Dissolve（Pixi.js 不支持，使用 NORMAL 作为替代）
    'dissolve': PIXI.BLEND_MODES.NORMAL,
    '溶解': PIXI.BLEND_MODES.NORMAL,
    
    // 正片叠底 - Multiply
    'multiply': PIXI.BLEND_MODES.MULTIPLY,
    '正片叠底': PIXI.BLEND_MODES.MULTIPLY,
    
    // 屏幕 - Screen
    'screen': PIXI.BLEND_MODES.SCREEN,
    '屏幕': PIXI.BLEND_MODES.SCREEN,
    
    // 叠加 - Overlay
    'overlay': PIXI.BLEND_MODES.OVERLAY,
    '叠加': PIXI.BLEND_MODES.OVERLAY,
    
    // 柔光 - Soft Light（Pixi.js 不支持，使用 OVERLAY 作为替代）
    'softlight': PIXI.BLEND_MODES.OVERLAY,
    'soft light': PIXI.BLEND_MODES.OVERLAY,
    '柔光': PIXI.BLEND_MODES.OVERLAY,
    
    // 强光 - Hard Light（Pixi.js 不支持，使用 OVERLAY 作为替代）
    'hardlight': PIXI.BLEND_MODES.OVERLAY,
    'hard light': PIXI.BLEND_MODES.OVERLAY,
    '强光': PIXI.BLEND_MODES.OVERLAY,
    
    // 亮光 - Vivid Light（Pixi.js 不支持，使用 OVERLAY 作为替代）
    'vividlight': PIXI.BLEND_MODES.OVERLAY,
    'vivid light': PIXI.BLEND_MODES.OVERLAY,
    '亮光': PIXI.BLEND_MODES.OVERLAY,
    
    // 线性加深 - Linear Burn（PIXI.js v6 可能不支持，使用 MULTIPLY 作为替代）
    'linearburn': PIXI.BLEND_MODES.MULTIPLY,
    'linear burn': PIXI.BLEND_MODES.MULTIPLY,
    '线性加深': PIXI.BLEND_MODES.MULTIPLY,
    
    // 线性减淡 - Linear Dodge (Add)
    'lineardodge': PIXI.BLEND_MODES.ADD,
    'linear dodge': PIXI.BLEND_MODES.ADD,
    'add': PIXI.BLEND_MODES.ADD,
    '线性减淡': PIXI.BLEND_MODES.ADD,
    
    // 颜色加深 - Color Burn
    'colorburn': PIXI.BLEND_MODES.COLOR_BURN,
    'color burn': PIXI.BLEND_MODES.COLOR_BURN,
    '颜色加深': PIXI.BLEND_MODES.COLOR_BURN,
    
    // 颜色减淡 - Color Dodge
    'colordodge': PIXI.BLEND_MODES.COLOR_DODGE,
    'color dodge': PIXI.BLEND_MODES.COLOR_DODGE,
    '颜色减淡': PIXI.BLEND_MODES.COLOR_DODGE,
    
    // 差值 - Difference
    'difference': PIXI.BLEND_MODES.DIFFERENCE,
    '差值': PIXI.BLEND_MODES.DIFFERENCE,
    
    // 排除 - Exclusion
    'exclusion': PIXI.BLEND_MODES.EXCLUSION,
    '排除': PIXI.BLEND_MODES.EXCLUSION,
    
    // 色相 - Hue（Pixi.js 不支持，使用 NORMAL 作为替代）
    'hue': PIXI.BLEND_MODES.NORMAL,
    '色相': PIXI.BLEND_MODES.NORMAL,
    
    // 饱和度 - Saturation（Pixi.js 不支持，使用 NORMAL 作为替代）
    'saturation': PIXI.BLEND_MODES.NORMAL,
    '饱和度': PIXI.BLEND_MODES.NORMAL,
    
    // 颜色 - Color（Pixi.js 不支持，使用 NORMAL 作为替代）
    'color': PIXI.BLEND_MODES.NORMAL,
    '颜色': PIXI.BLEND_MODES.NORMAL,
    
    // 亮度 - Luminosity（Pixi.js 不支持，使用 NORMAL 作为替代）
    'luminosity': PIXI.BLEND_MODES.NORMAL,
    '亮度': PIXI.BLEND_MODES.NORMAL,
    
    // 变暗 - Darken
    'darken': PIXI.BLEND_MODES.DARKEN,
    '变暗': PIXI.BLEND_MODES.DARKEN,
    
    // 变亮 - Lighten
    'lighten': PIXI.BLEND_MODES.LIGHTEN,
    '变亮': PIXI.BLEND_MODES.LIGHTEN,
    
    // 图案叠加 - Pattern Overlay（Pixi.js 不支持，使用 NORMAL 作为替代）
    'patternoverlay': PIXI.BLEND_MODES.NORMAL,
    'pattern overlay': PIXI.BLEND_MODES.NORMAL,
    '图案叠加': PIXI.BLEND_MODES.NORMAL,
    
    // 实色叠加 - Solid Color（Pixi.js 不支持，使用 NORMAL 作为替代）
    'solidcolor': PIXI.BLEND_MODES.NORMAL,
    'solid color': PIXI.BLEND_MODES.NORMAL,
    '实色叠加': PIXI.BLEND_MODES.NORMAL,
};

/**
 * 获取混合模式值
 * @param modeName 混合模式名称（支持中英文，不区分大小写）
 * @returns PIXI.BLEND_MODES 常量，如果未找到则返回 NORMAL
 */
export function getBlendMode(modeName: string | undefined | null): number {
    if (!modeName) {
        return PIXI.BLEND_MODES.NORMAL;
    }
    
    // 转换为小写并去除空格
    const normalized = modeName.toLowerCase().trim();
    
    // 先尝试直接匹配
    if (BLEND_MODE_MAP[normalized] !== undefined) {
        return BLEND_MODE_MAP[normalized];
    }
    
    // 尝试移除空格和下划线
    const variants = [
        normalized.replace(/\s+/g, ''),
        normalized.replace(/_/g, ''),
        normalized.replace(/\s+/g, '_'),
    ];
    
    for (const variant of variants) {
        if (BLEND_MODE_MAP[variant] !== undefined) {
            return BLEND_MODE_MAP[variant];
        }
    }
    
    // 如果都找不到，返回默认值
    console.warn(`未知的混合模式: ${modeName}，使用 NORMAL 作为默认值`);
    return PIXI.BLEND_MODES.NORMAL;
}

/**
 * 获取混合模式名称（用于导出）
 * @param blendMode PIXI.BLEND_MODES 常量值
 * @returns 混合模式的英文名称（首字母大写，符合用户示例格式）
 */
export function getBlendModeName(blendMode: number | undefined | null): string {
    if (blendMode === undefined || blendMode === null) {
        return 'Normal';
    }
    
    // 反向查找：从 PIXI.BLEND_MODES 值到名称
    // 使用首字母大写的格式，符合用户示例 blending_mode=Multiply
    const modeNames: Record<number, string> = {
        [PIXI.BLEND_MODES.NORMAL]: 'Normal',
        [PIXI.BLEND_MODES.MULTIPLY]: 'Multiply',
        [PIXI.BLEND_MODES.SCREEN]: 'Screen',
        [PIXI.BLEND_MODES.OVERLAY]: 'Overlay',
        [PIXI.BLEND_MODES.DARKEN]: 'Darken',
        [PIXI.BLEND_MODES.LIGHTEN]: 'Lighten',
        [PIXI.BLEND_MODES.COLOR_DODGE]: 'ColorDodge',
        [PIXI.BLEND_MODES.COLOR_BURN]: 'ColorBurn',
        [PIXI.BLEND_MODES.HARD_LIGHT]: 'HardLight',
        [PIXI.BLEND_MODES.SOFT_LIGHT]: 'SoftLight',
        [PIXI.BLEND_MODES.DIFFERENCE]: 'Difference',
        [PIXI.BLEND_MODES.EXCLUSION]: 'Exclusion',
        [PIXI.BLEND_MODES.HUE]: 'Hue',
        [PIXI.BLEND_MODES.SATURATION]: 'Saturation',
        [PIXI.BLEND_MODES.COLOR]: 'Color',
        [PIXI.BLEND_MODES.LUMINOSITY]: 'Luminosity',
        [PIXI.BLEND_MODES.ADD]: 'Add',
        [PIXI.BLEND_MODES.SUBTRACT]: 'Subtract',
    };
    
    return modeNames[blendMode] || 'Normal';
}

