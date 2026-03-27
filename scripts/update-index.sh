#!/bin/bash

# 沃伦巴菲虾 - 自动更新主页案例链接脚本
# 用途：根据 cases.yaml 自动生成 index.html 中的案例库部分

set -e

WORKSPACE="/home/admin/.openclaw/workspace"
CASES_YAML="$WORKSPACE/cases.yaml"
INDEX_HTML="$WORKSPACE/index.html"
BACKUP_HTML="$WORKSPACE/index.html.bak"

echo "🦞 沃伦巴菲虾 - 自动更新主页案例链接"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 检查文件
if [ ! -f "$CASES_YAML" ]; then
    echo "❌ 错误：cases.yaml 不存在"
    exit 1
fi

if [ ! -f "$INDEX_HTML" ]; then
    echo "❌ 错误：index.html 不存在"
    exit 1
fi

# 备份原文件
cp "$INDEX_HTML" "$BACKUP_HTML"
echo "✅ 已备份：index.html.bak"
echo ""

# 生成案例卡片 HTML
generate_case_cards() {
    local cards=""
    local current_id=""
    local current_name=""
    local current_icon=""
    local current_file=""
    local current_year=""
    local current_hold=""
    local current_invest=""
    local current_return=""
    local current_date=""
    local current_status=""
    local count=0
    local max_display=4
    
    while IFS= read -r line || [ -n "$line" ]; do
        # 解析字段
        if [[ $line =~ id:\ *\"([0-9]+)\" ]]; then
            current_id="${BASH_REMATCH[1]}"
        fi
        if [[ $line =~ name:\ *\"(.+)\" ]]; then
            current_name="${BASH_REMATCH[1]}"
        fi
        if [[ $line =~ icon:\ *\"(.+)\" ]]; then
            current_icon="${BASH_REMATCH[1]}"
        fi
        if [[ $line =~ file:\ *\"(.+)\" ]]; then
            current_file="${BASH_REMATCH[1]}"
        fi
        if [[ $line =~ year:\ *\"(.+)\" ]]; then
            current_year="${BASH_REMATCH[1]}"
        fi
        if [[ $line =~ hold_period:\ *\"(.+)\" ]]; then
            current_hold="${BASH_REMATCH[1]}"
        fi
        if [[ $line =~ invest:\ *\"(.+)\" ]]; then
            current_invest="${BASH_REMATCH[1]}"
        fi
        if [[ $line =~ return:\ *\"(.+)\" ]]; then
            current_return="${BASH_REMATCH[1]}"
        fi
        if [[ $line =~ date:\ *\"(.+)\" ]]; then
            current_date="${BASH_REMATCH[1]}"
        fi
        if [[ $line =~ status:\ *(published|pending) ]]; then
            current_status="${BASH_REMATCH[1]}"
        fi
        
        # 遇到新的 case 或文件结束时处理
        if [[ $line =~ ^[[:space:]]*-[[:space:]]*id: ]] || [[ $line =~ ^settings: ]]; then
            if [ -n "$current_id" ] && [ "$count" -lt "$max_display" ]; then
                if [ "$current_status" = "published" ]; then
                    cards+="                <a href=\"$current_file\" class=\"case-card\">
                    <div class=\"case-number\">CASE #$current_id · $current_date</div>
                    <div class=\"case-name\">$current_icon $current_name</div>
                    <div class=\"case-year\">$current_year 年 · $current_hold</div>
                    <div class=\"case-desc\">投资 $current_invest，$current_return</div>
                </a>
                
"
                    count=$((count + 1))
                elif [ "$current_status" = "pending" ] && [ "$count" -lt "$max_display" ]; then
                    cards+="                <span class=\"case-card\" style=\"opacity: 0.5; cursor: default;\">
                    <div class=\"case-number\">CASE #$current_id · 即将上线</div>
                    <div class=\"case-name\">$current_icon $current_name</div>
                    <div class=\"case-year\">$current_year 年 · $current_hold</div>
                    <div class=\"case-desc\">投资 $current_invest，$current_return</div>
                </span>
                
"
                    count=$((count + 1))
                fi
            fi
        fi
    done < "$CASES_YAML"
    
    echo "$cards"
}

# 生成导航栏案例链接
generate_nav_links() {
    local links=""
    local current_name=""
    local current_file=""
    local current_status=""
    
    while IFS= read -r line || [ -n "$line" ]; do
        if [[ $line =~ name:\ *\"(.+)\" ]]; then
            current_name="${BASH_REMATCH[1]}"
        fi
        if [[ $line =~ file:\ *\"(.+)\" ]]; then
            current_file="${BASH_REMATCH[1]}"
        fi
        if [[ $line =~ status:\ *(published|pending) ]]; then
            current_status="${BASH_REMATCH[1]}"
            if [ "$current_status" = "published" ]; then
                local short_name=$(echo "$current_name" | cut -d' ' -f1)
                links+="            <a href=\"$current_file\" target=\"_blank\" style=\"margin-left:15px;\">$short_name↗</a>
"
            fi
        fi
    done < "$CASES_YAML"
    
    echo "$links"
}

echo "📝 生成案例卡片..."
NEW_CARDS=$(generate_case_cards)

echo "📝 生成导航栏链接..."
NEW_NAV_LINKS=$(generate_nav_links)

echo ""
echo "⚠️  注意：自动替换功能需要手动配置 sed 规则"
echo "    当前版本仅生成新内容，请手动替换 index.html 中的对应部分"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 生成的新案例卡片："
echo ""
echo "$NEW_CARDS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ 生成的新导航栏链接："
echo ""
echo "$NEW_NAV_LINKS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "💡 下一步：手动将上述内容替换到 index.html 中对应位置"
echo "   或使用编辑工具进行精确替换"
