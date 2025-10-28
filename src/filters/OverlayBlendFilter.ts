import * as PIXI from 'pixi.js';

/**
 * 观察层混合模式滤镜
 * 支持"颜色"和"明度"混合模式
 */
export class OverlayBlendFilter extends PIXI.Filter {
    private _overlayBlendMode: 'color' | 'luminosity' = 'color';
    private _sceneTexture: PIXI.Texture | null = null;

    constructor(blendMode: 'color' | 'luminosity' = 'color', sceneTexture?: PIXI.Texture) {
        const vertexShader = `
            attribute vec2 aVertexPosition;
            attribute vec2 aTextureCoord;
            uniform mat3 projectionMatrix;
            varying vec2 vTextureCoord;

            void main(void) {
                gl_Position = vec4((projectionMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
                vTextureCoord = aTextureCoord;
            }
        `;

        const fragmentShader = `
            precision mediump float;
            
            varying vec2 vTextureCoord;
            uniform sampler2D uSampler;  // 观察层纹理（中性灰）
            uniform sampler2D sceneTexture;  // 场景纹理
            uniform float blendMode; // 0 = color, 1 = luminosity
            uniform float hasSceneTexture;  // 是否有场景纹理 (0.0 = false, 1.0 = true)
            
            // RGB 转 HSL 辅助函数
            vec3 rgb2hsl(vec3 color) {
                float maxVal = max(max(color.r, color.g), color.b);
                float minVal = min(min(color.r, color.g), color.b);
                float delta = maxVal - minVal;
                
                float l = (maxVal + minVal) / 2.0;
                float s = 0.0;
                float h = 0.0;
                
                if (delta != 0.0) {
                    s = l < 0.5 ? delta / (maxVal + minVal) : delta / (2.0 - maxVal - minVal);
                    
                    if (maxVal == color.r) {
                        h = mod((color.g - color.b) / delta + (color.g < color.b ? 6.0 : 0.0), 6.0) / 6.0;
                    } else if (maxVal == color.g) {
                        h = (color.b - color.r) / delta + 2.0;
                        h = mod(h, 6.0) / 6.0;
                    } else {
                        h = (color.r - color.g) / delta + 4.0;
                        h = mod(h, 6.0) / 6.0;
                    }
                }
                
                return vec3(h, s, l);
            }
            
            // HSL 转 RGB 辅助函数
            vec3 hsl2rgb(vec3 hsl) {
                float h = hsl.x * 6.0;
                float s = hsl.y;
                float l = hsl.z;
                
                float c = (1.0 - abs(2.0 * l - 1.0)) * s;
                float x = c * (1.0 - abs(mod(h, 2.0) - 1.0));
                float m = l - c / 2.0;
                
                vec3 rgb;
                if (h < 1.0) {
                    rgb = vec3(c, x, 0.0);
                } else if (h < 2.0) {
                    rgb = vec3(x, c, 0.0);
                } else if (h < 3.0) {
                    rgb = vec3(0.0, c, x);
                } else if (h < 4.0) {
                    rgb = vec3(0.0, x, c);
                } else if (h < 5.0) {
                    rgb = vec3(x, 0.0, c);
                } else {
                    rgb = vec3(c, 0.0, x);
                }
                
                return rgb + m;
            }
            
            void main(void) {
                // uSampler 是观察层的中性灰纹理
                vec4 overlayColor = texture2D(uSampler, vTextureCoord);
                
                // 中性灰 RGB(128, 128, 128) = vec3(0.5, 0.5, 0.5)
                vec3 gray = vec3(0.5, 0.5, 0.5);
                
                if (hasSceneTexture > 0.5) { // hasSceneTexture is 1.0 if true
                    // 从场景纹理读取底层内容
                    vec4 baseColor = texture2D(sceneTexture, vTextureCoord);
                    
                    if (blendMode < 0.5) {
                        // 颜色模式：保留底层的亮度，使用上层的色相和饱和度（灰色 = 去色）
                        float luminance = dot(baseColor.rgb, vec3(0.299, 0.587, 0.114));
                        gl_FragColor = vec4(vec3(luminance), baseColor.a);
                    } else {
                        // 明度模式：保留底层的色相和饱和度，使用上层的亮度（0.5）
                        vec3 baseHSL = rgb2hsl(baseColor.rgb);
                        vec3 resultHSL = vec3(baseHSL.x, baseHSL.y, 0.5);
                        vec3 resultRGB = hsl2rgb(resultHSL);
                        gl_FragColor = vec4(resultRGB, baseColor.a);
                    }
                } else {
                    // 如果没有场景纹理，直接显示灰色
                    gl_FragColor = overlayColor;
                }
            }
        `;

        super(vertexShader, fragmentShader);
        this._overlayBlendMode = blendMode;
        this._sceneTexture = sceneTexture || null;
        
        // 设置uniforms
        this.uniforms.blendMode = blendMode === 'color' ? 0.0 : 1.0;
        this.uniforms.hasSceneTexture = sceneTexture ? 1.0 : 0.0;
        
        if (sceneTexture) {
            // 注意：PIXI的Filter需要将纹理添加到filterGlobals或通过其他方式传递
            // 这里我们使用一个技巧：将纹理存储在uniforms中
            (this.uniforms as any).sceneTexture = sceneTexture;
        }
    }

    get overlayBlendMode(): 'color' | 'luminosity' {
        return this._overlayBlendMode;
    }

    set overlayBlendMode(value: 'color' | 'luminosity') {
        if (this._overlayBlendMode !== value) {
            this._overlayBlendMode = value;
            this.uniforms.blendMode = value === 'color' ? 0.0 : 1.0;
        }
    }
    
    // 提供方法来更新混合模式（避免与父类属性冲突）
    setBlendMode(value: 'color' | 'luminosity') {
        this.overlayBlendMode = value;
    }
    
    set sceneTexture(value: PIXI.Texture | null) {
        this._sceneTexture = value;
        this.uniforms.hasSceneTexture = value ? 1.0 : 0.0;
        if (value) {
            (this.uniforms as any).sceneTexture = value;
        }
    }
    
    get sceneTexture(): PIXI.Texture | null {
        return this._sceneTexture;
    }
}

