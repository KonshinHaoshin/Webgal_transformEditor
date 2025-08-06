export {};

declare global {
    interface Window {
        api: {
            getAssetPath: (filename: string) => string;
        };
    }
}
