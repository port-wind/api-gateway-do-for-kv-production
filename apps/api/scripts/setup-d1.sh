#!/bin/bash

#######################################
# D1 数据库设置脚本
# 
# 用途：自动创建 D1 数据库并执行迁移
# 作者：Phase 2 Implementation
# 日期：2025-10-15
#######################################

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  D1 数据库设置向导${NC}"
echo -e "${BLUE}========================================${NC}"
echo

# 1. 选择环境
echo -e "${YELLOW}请选择要设置的环境:${NC}"
echo "  1) 测试环境（默认）"
echo "  2) Dev 环境"
echo "  3) 生产环境"
echo
read -p "请输入选项 (1-3) [默认: 1]: " ENV_CHOICE
ENV_CHOICE=${ENV_CHOICE:-1}

case $ENV_CHOICE in
  1)
    ENV_NAME="default"
    DB_NAME="path-stats-db"
    ENV_FLAG=""
    ;;
  2)
    ENV_NAME="dev"
    DB_NAME="path-stats-db"
    ENV_FLAG="--env dev"
    ;;
  3)
    ENV_NAME="production"
    DB_NAME="path-stats-db-prod"
    ENV_FLAG="--env production"
    ;;
  *)
    echo -e "${RED}❌ 无效选项${NC}"
    exit 1
    ;;
esac

echo
echo -e "${GREEN}✅ 选择环境: ${ENV_NAME}${NC}"
echo -e "${GREEN}✅ 数据库名称: ${DB_NAME}${NC}"
echo

# 2. 检查是否已存在数据库
echo -e "${BLUE}检查数据库是否已存在...${NC}"
if npx wrangler d1 list | grep -q "$DB_NAME"; then
  echo -e "${YELLOW}⚠️  数据库 '${DB_NAME}' 已存在${NC}"
  read -p "是否继续（将跳过创建步骤）? (y/n) [y]: " CONTINUE
  CONTINUE=${CONTINUE:-y}
  
  if [[ ! "$CONTINUE" =~ ^[Yy]$ ]]; then
    echo -e "${RED}❌ 已取消${NC}"
    exit 0
  fi
  
  SKIP_CREATE=true
else
  SKIP_CREATE=false
fi

# 3. 创建数据库（如果不存在）
if [ "$SKIP_CREATE" = false ]; then
  echo
  echo -e "${BLUE}创建 D1 数据库...${NC}"
  
  CREATE_OUTPUT=$(npx wrangler d1 create "$DB_NAME")
  echo "$CREATE_OUTPUT"
  
  # 提取 database_id
  DATABASE_ID=$(echo "$CREATE_OUTPUT" | grep "database_id" | sed 's/.*database_id = "\(.*\)"/\1/')
  
  if [ -z "$DATABASE_ID" ]; then
    echo -e "${RED}❌ 无法提取 database_id，请手动更新 wrangler.toml${NC}"
  else
    echo
    echo -e "${GREEN}✅ 数据库创建成功！${NC}"
    echo -e "${YELLOW}database_id: ${DATABASE_ID}${NC}"
    echo
    echo -e "${BLUE}正在更新 wrangler.toml...${NC}"
    
    # 更新 wrangler.toml 中的 database_id
    case $ENV_CHOICE in
      1)
        # 默认环境 - 使用范围匹配，确保只替换 [[d1_databases]] 块中的
        sed -i.bak "/^\[\[d1_databases\]\]/,/^database_id/ s|database_id = \"PLACEHOLDER\".*|database_id = \"$DATABASE_ID\"|" "$PROJECT_ROOT/wrangler.toml"
        ;;
      2)
        # Dev 环境 - 使用范围匹配，确保只替换 [[env.dev.d1_databases]] 块中的
        sed -i.bak "/^\[\[env\.dev\.d1_databases\]\]/,/^database_id/ s|database_id = \"PLACEHOLDER\".*|database_id = \"$DATABASE_ID\"|" "$PROJECT_ROOT/wrangler.toml"
        ;;
      3)
        # 生产环境 - 使用范围匹配，确保只替换 [[env.production.d1_databases]] 块中的
        sed -i.bak "/^\[\[env\.production\.d1_databases\]\]/,/^database_id/ s|database_id = \"PLACEHOLDER\".*|database_id = \"$DATABASE_ID\"|" "$PROJECT_ROOT/wrangler.toml"
        ;;
    esac
    
    # 删除备份文件
    rm -f "$PROJECT_ROOT/wrangler.toml.bak"
    
    echo -e "${GREEN}✅ wrangler.toml 已更新${NC}"
  fi
else
  echo -e "${BLUE}跳过数据库创建步骤${NC}"
  
  # 尝试从 wrangler.toml 读取 database_id
  if [ "$ENV_NAME" = "production" ]; then
    DATABASE_ID=$(grep -A 3 "\[env.production.d1_databases\]" "$PROJECT_ROOT/wrangler.toml" | grep "database_id" | sed 's/.*database_id = "\(.*\)".*/\1/')
  else
    DATABASE_ID=$(grep -A 3 "^\[\[d1_databases\]\]" "$PROJECT_ROOT/wrangler.toml" | grep "database_id" | sed 's/.*database_id = "\(.*\)".*/\1/')
  fi
  
  if [ "$DATABASE_ID" = "PLACEHOLDER" ] || [ -z "$DATABASE_ID" ]; then
    echo -e "${RED}❌ 无法从 wrangler.toml 读取 database_id${NC}"
    echo -e "${YELLOW}请手动运行以下命令获取 database_id:${NC}"
    echo -e "  ${BLUE}npx wrangler d1 list${NC}"
    exit 1
  fi
  
  echo -e "${GREEN}✅ database_id: ${DATABASE_ID}${NC}"
fi

# 4. 执行数据库迁移
echo
echo -e "${BLUE}执行数据库迁移...${NC}"
read -p "是否执行迁移脚本? (y/n) [y]: " RUN_MIGRATION
RUN_MIGRATION=${RUN_MIGRATION:-y}

if [[ "$RUN_MIGRATION" =~ ^[Yy]$ ]]; then
  echo -e "${BLUE}运行: wrangler d1 execute $DB_NAME --file=./migrations/0001_create_path_stats_tables.sql $ENV_FLAG${NC}"
  
  cd "$PROJECT_ROOT"
  npx wrangler d1 execute "$DB_NAME" --file=./migrations/0001_create_path_stats_tables.sql $ENV_FLAG
  
  echo
  echo -e "${GREEN}✅ 迁移执行成功！${NC}"
else
  echo -e "${YELLOW}⚠️  跳过迁移步骤${NC}"
  echo -e "${YELLOW}稍后可手动执行:${NC}"
  echo -e "  ${BLUE}cd $PROJECT_ROOT${NC}"
  echo -e "  ${BLUE}npx wrangler d1 execute $DB_NAME --file=./migrations/0001_create_path_stats_tables.sql $ENV_FLAG${NC}"
fi

# 5. 验证表结构
echo
echo -e "${BLUE}验证表结构...${NC}"
read -p "是否验证表结构? (y/n) [y]: " VERIFY
VERIFY=${VERIFY:-y}

if [[ "$VERIFY" =~ ^[Yy]$ ]]; then
  echo
  echo -e "${BLUE}查询数据库表:${NC}"
  npx wrangler d1 execute "$DB_NAME" $ENV_FLAG \
    --command="SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  
  echo
  echo -e "${BLUE}查询数据库索引:${NC}"
  npx wrangler d1 execute "$DB_NAME" $ENV_FLAG \
    --command="SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
fi

# 6. 完成提示
echo
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ✅ D1 数据库设置完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo
echo -e "${BLUE}数据库信息:${NC}"
echo -e "  名称: ${GREEN}${DB_NAME}${NC}"
echo -e "  ID: ${GREEN}${DATABASE_ID}${NC}"
echo -e "  环境: ${GREEN}${ENV_NAME}${NC}"
echo
echo -e "${BLUE}下一步:${NC}"
echo "  1. 检查 wrangler.toml 中的 database_id 是否正确"
echo "  2. 运行测试: npm test tests/unit/queue-aggregator.test.ts"
echo "  3. 部署 Worker: npm run deploy${ENV_FLAG}"
echo
echo -e "${YELLOW}📚 相关文档:${NC}"
echo "  - D1 Schema: docs/d1-schema.md"
echo "  - Phase 2 实施计划: ../../docs/path-stats-phase2-implementation-plan.md"
echo

