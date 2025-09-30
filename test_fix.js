// 测试修复后的动画起始状态快照逻辑
const transforms = [
  {
    type: 'setTransform',
    target: 'figure1',
    transform: {
      position: { x: 100, y: 200 },
      rotation: 0.5,
      scale: { x: 1.2, y: 1.2 },
      brightness: 0.8
    }
  },
  {
    type: 'setTransform',
    target: 'figure2',
    transform: {
      position: { x: -50, y: 150 },
      rotation: -0.3,
      scale: { x: 0.8, y: 0.8 },
      contrast: 1.2
    }
  }
];

// 模拟修复后的 playAnimation 函数的逻辑
function testPlayAnimation() {
  // 过滤出所有的 setTransform 项目
  const setTransformItems = transforms.filter(t => t.type === 'setTransform');
  
  console.log('setTransform 项目:', setTransformItems);
  
  // 创建每个 target 的当前状态快照
  const targetCurrentStates = new Map();
  
  // 遍历所有 transforms，为每个 target 记录最新的状态
  transforms.forEach((t) => {
    if (t.type === 'setTransform') {
      const target = t.target;
      // 如果这个 target 还没有记录，则记录它
      if (!targetCurrentStates.has(target)) {
        targetCurrentStates.set(target, {
          position: { ...t.transform.position },
          rotation: t.transform.rotation || 0,
          scale: { ...t.transform.scale },
          // 复制其他可能的属性
          ...Object.fromEntries(
            Object.entries(t.transform).filter(([key]) => 
              !['position', 'rotation', 'scale'].includes(key)
            )
          )
        });
      }
    }
  });
  
  console.log('各 target 的起始状态快照:', Object.fromEntries(targetCurrentStates));
  
  // 创建动画数据
  const newAnimationData = setTransformItems.map((transform) => {
    const target = transform.target;
    const duration = 500;
    
    // 获取当前 target 的状态作为起始状态，如果没有则使用默认值
    const startState = targetCurrentStates.get(target) || {
      position: { x: 0, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 }
    };
    
    return {
      target,
      duration,
      startState: startState,
      endState: transform.transform
    };
  });
  
  console.log('动画数据:', newAnimationData);
  
  // 验证起始状态和结束状态是否不同
  newAnimationData.forEach(anim => {
    const startPos = anim.startState.position;
    const endPos = anim.endState.position;
    const startScale = anim.startState.scale;
    const endScale = anim.endState.scale;
    
    console.log(`${anim.target}:`);
    console.log(`  位置: (${startPos.x}, ${startPos.y}) -> (${endPos.x}, ${endPos.y})`);
    console.log(`  缩放: (${startScale.x}, ${startScale.y}) -> (${endScale.x}, ${endScale.y})`);
    console.log(`  旋转: ${anim.startState.rotation} -> ${anim.endState.rotation}`);
  });
}

testPlayAnimation(); 