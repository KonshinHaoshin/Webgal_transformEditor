#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查是否在 git 仓库中
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}错误: 当前目录不是 git 仓库${NC}"
    exit 1
fi

# 检查工作区是否干净
if ! git diff-index --quiet HEAD --; then
    echo -e "${YELLOW}警告: 工作区有未提交的更改${NC}"
    read -p "是否继续? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 读取版本号
if [ -f "package.json" ]; then
    VERSION=$(node -p "require('./package.json').version")
elif [ -f "src-tauri/tauri.conf.json" ]; then
    VERSION=$(node -p "require('./src-tauri/tauri.conf.json').version")
else
    echo -e "${RED}错误: 找不到版本号文件${NC}"
    exit 1
fi

if [ -z "$VERSION" ]; then
    echo -e "${RED}错误: 无法读取版本号${NC}"
    exit 1
fi

TAG_NAME="v${VERSION}"

# 检查 tag 是否已存在
if git rev-parse "$TAG_NAME" > /dev/null 2>&1; then
    echo -e "${YELLOW}警告: Tag $TAG_NAME 已存在${NC}"
    read -p "是否删除并重新创建? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # 删除本地 tag
        git tag -d "$TAG_NAME" 2>/dev/null
        # 删除远程 tag
        git push origin ":refs/tags/$TAG_NAME" 2>/dev/null
        echo -e "${GREEN}已删除旧 tag${NC}"
    else
        echo -e "${YELLOW}已取消${NC}"
        exit 1
    fi
fi

# 创建 tag
echo -e "${GREEN}正在创建 tag: $TAG_NAME${NC}"
git tag -a "$TAG_NAME" -m "Release version $VERSION"

# 推送 tag 到 GitHub
echo -e "${GREEN}正在推送 tag 到 GitHub...${NC}"
git push origin "$TAG_NAME"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Tag $TAG_NAME 已成功推送到 GitHub${NC}"
    echo -e "${GREEN}GitHub Actions 将自动触发构建流程${NC}"
else
    echo -e "${RED}✗ 推送 tag 失败${NC}"
    exit 1
fi

