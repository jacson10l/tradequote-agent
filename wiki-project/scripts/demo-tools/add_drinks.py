#!/usr/bin/env python3
"""
将饮料照片信息整理成系统要求的 CSV 格式，追加到 catalog_converted.csv
"""

import csv
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_FILE = os.path.join(BASE_DIR, "catalog_converted.csv")

# 饮料数据（从照片提取）
# 格式：sku, name, category, unit, currency, min_quantity, unit_price, valid_until, description
drinks = [
    # 图1：统一鲜橙多、康师傅冰红茶、C2 绿茶
    ("DRINK-001", "统一鲜橙多 Orangete", "饮料", "bottle", "USD", "1", "1.29", "2027-12-31", "品牌：统一 Unif; 规格：450ml; 产地：中国; 维生素C添加"),
    ("DRINK-002", "康师傅冰红茶 Ice Black Tea Drink", "饮料", "bottle", "USD", "1", "1.29", "2027-12-31", "品牌：康师傅 Kang Shi Fu; 规格：500ml (16.9 FL OZ); 人工柠檬味; 产地：中国广州; 210卡路里"),
    ("DRINK-003", "C2 绿茶柠檬味 Green Tea Lemon Drink", "饮料", "bottle", "USD", "1", "1.29", "2027-12-31", "品牌：C2; 规格：500ml; 韩文：씨투 그린티; 产地：中国"),
    ("DRINK-004", "C2 绿茶苹果味 Green Tea Apple Drink", "饮料", "bottle", "USD", "1", "1.29", "2027-12-31", "品牌：C2; 规格：500ml; 韩文：씨투 그린티 사과맛; 产地：中国"),
    
    # 图3：梅子乌龙、东方树叶
    ("DRINK-005", "梅子乌龙茶 Plum Flavored Oolong Tea", "饮料", "bottle", "USD", "1", "1.99", "2027-12-31", "品牌：Funtree; 规格：487ml (16.5 fl oz); 含青梅浓缩汁、乌龙茶; 210卡路里; 产地：中国"),
    ("DRINK-006", "东方树叶茉莉花茶 Jasmine Tea", "饮料", "bottle", "USD", "1", "1.99", "2027-12-31", "品牌：农夫山泉 Nongfu Spring; 规格：500ml; 茶多酚≥280mg/kg; 0卡路里; 产地：中国杭州; 保质期9个月"),
]

# 读取现有 CSV
existing_rows = []
with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    for row in reader:
        existing_rows.append(row)

# 追加饮料数据
for drink in drinks:
    existing_rows.append({
        'sku': drink[0],
        'name': drink[1],
        'category': drink[2],
        'unit': drink[3],
        'currency': drink[4],
        'min_quantity': drink[5],
        'unit_price': drink[6],
        'valid_until': drink[7],
        'description': drink[8],
    })

# 写回文件
with open(OUTPUT_FILE, 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(existing_rows)

print(f"追加完成！")
print(f"  原有行数：{len(existing_rows) - len(drinks)}")
print(f"  新增饮料：{len(drinks)}")
print(f"  总行数：{len(existing_rows)}")
print(f"  文件：{OUTPUT_FILE}")
