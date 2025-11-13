/**
 * 从 JSONL 或 JSON 文件中提取 motions 和 expressions 列表
 * 使用后端 Rust 代码读取文件，避免路径转换问题
 * @param filePath JSONL 或 JSON 文件路径（相对路径，相对于游戏文件夹的 figure 目录）
 * @param gameFolder 可选的游戏文件夹路径（如果不提供，会尝试从 webgalFileManager 获取）
 * @returns 包含 motions 和 expressions 数组的对象
 */
export async function extractMotionsAndExpressions(
  filePath: string,
  gameFolder?: string | null
): Promise<{
  motions: string[];
  expressions: string[];
}> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    
    // 如果没有传入 gameFolder，尝试从 webgalFileManager 获取
    let finalGameFolder = gameFolder;
    if (!finalGameFolder) {
      try {
        const { webgalFileManager } = await import('./webgalFileManager');
        finalGameFolder = webgalFileManager.getGameFolder();
      } catch (e) {
        console.warn('无法从 webgalFileManager 获取游戏文件夹:', e);
      }
    }
    
    const isJsonl = filePath.toLowerCase().endsWith('.jsonl');
    const isJson = filePath.toLowerCase().endsWith('.json');
    const fileType = isJsonl ? 'JSONL' : isJson ? 'JSON' : '未知';
    
    console.log(`🔍 正在通过后端加载 ${fileType}: ${filePath}`);
    console.log(`   游戏文件夹: ${finalGameFolder || '未设置'}`);
    
    // 调用后端命令
    const result = await invoke<{ motions: string[]; expressions: string[] }>(
      'extract_jsonl_motions_expressions',
      {
        filePath: filePath,
        gameFolder: finalGameFolder || null
      }
    );
    
    console.log(`✅ 成功提取: ${result.motions.length} 个 motions, ${result.expressions.length} 个 expressions`);
    return {
      motions: result.motions || [],
      expressions: result.expressions || []
    };
  } catch (error) {
    console.error('❌ 提取 motions 和 expressions 失败:', error);
    console.error('   路径:', filePath);
    if (error instanceof Error) {
      console.error('   错误信息:', error.message);
    }
    return { motions: [], expressions: [] };
  }
}

