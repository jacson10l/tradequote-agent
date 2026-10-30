#!/usr/bin/env python3
"""
将 demo_products.csv + demo_price_tiers.csv 转换为系统要求的 catalog CSV 格式
系统要求：sku,name,category,unit,currency,min_quantity,unit_price,valid_until,description
"""

import csv
import os

# 路径
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PRODUCTS_FILE = os.path.join(BASE_DIR, "demo_products.csv")
PRICE_TIERS_FILE = os.path.join(BASE_DIR, "demo_price_tiers.csv")
OUTPUT_FILE = os.path.join(BASE_DIR, "catalog_converted.csv")

def load_products():
    """加载商品主表"""
    products = {}
    with open(PRODUCTS_FILE, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            pid = row['product_id']
            products[pid] = {
                'name': row['product_name'],
                'category': row['category'],
                'remark': row.get('remark', ''),
                'gsm': row.get('gsm', ''),
                'material': row.get('material', ''),
                'supplier_id': row.get('supplier_id', ''),
            }
    return products

def load_price_tiers():
    """加载价格档位表"""
    tiers = {}
    with open(PRICE_TIERS_FILE, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            pid = row['product_id']
            if pid not in tiers:
                tiers[pid] = []
            # 解析价格（去掉 ¥ 符号）
            price_text = row['price_page_text'].replace('¥', '').strip()
            # 跳过区间价格（如 "¥26.92-46.85（区间价，无档位表）"）
            if '-' in price_text or '区间' in price_text:
                continue
            try:
                price = float(price_text)
                tiers[pid].append({
                    'qty_min': int(row['qty_min']),
                    'price': price,
                })
            except (ValueError, KeyError):
                continue
    return tiers

def convert():
    """主转换逻辑"""
    products = load_products()
    price_tiers = load_price_tiers()
    
    output_rows = []
    skipped = 0
    
    for pid, prod in products.items():
        if pid not in price_tiers or not price_tiers[pid]:
            skipped += 1
            continue
        
        # 构建 description
        desc_parts = []
        if prod['gsm']:
            desc_parts.append(f"克重:{prod['gsm']}")
        if prod['material']:
            desc_parts.append(f"材质:{prod['material']}")
        if prod['remark']:
            desc_parts.append(prod['remark'])
        description = '; '.join(desc_parts) if desc_parts else ''
        
        # 为每个价格档位生成一行
        for tier in price_tiers[pid]:
            output_rows.append({
                'sku': pid,
                'name': prod['name'],
                'category': prod['category'],
                'unit': 'piece',
                'currency': 'CNY',
                'min_quantity': tier['qty_min'],
                'unit_price': f"{tier['price']:.2f}",
                'valid_until': '2027-12-31',
                'description': description[:1000],  # 限制长度
            })
    
    # 写入输出文件
    fieldnames = ['sku', 'name', 'category', 'unit', 'currency', 'min_quantity', 'unit_price', 'valid_until', 'description']
    with open(OUTPUT_FILE, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output_rows)
    
    print(f"转换完成！")
    print(f"  输入商品数: {len(products)}")
    print(f"  跳过（无价格）: {skipped}")
    print(f"  输出行数: {len(output_rows)}")
    print(f"  输出文件: {OUTPUT_FILE}")

if __name__ == '__main__':
    convert()
