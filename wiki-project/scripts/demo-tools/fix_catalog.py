#!/usr/bin/env python3
"""
修复 catalog_converted.csv：
1. 删除饮料数据
2. 在 description 中加入 supplier_company 和 source_url
"""

import csv
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PRODUCTS_FILE = os.path.join(BASE_DIR, "demo_products.csv")
SOURCES_FILE = os.path.join(BASE_DIR, "demo_products_sources.csv")
PRICE_TIERS_FILE = os.path.join(BASE_DIR, "demo_price_tiers.csv")
OUTPUT_FILE = os.path.join(BASE_DIR, "catalog_converted.csv")

def load_sources():
    """加载来源信息"""
    sources = {}
    with open(SOURCES_FILE, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            pid = row['product_id']
            sources[pid] = {
                'supplier_company': row.get('supplier_company', ''),
                'source_url': row.get('source_url', ''),
                'collected_on': row.get('collected_on', '2026-10-21'),
            }
    return sources

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
            price_text = row['price_page_text'].replace('¥', '').strip()
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
    sources = load_sources()
    
    output_rows = []
    
    for pid, prod in products.items():
        if pid not in price_tiers or not price_tiers[pid]:
            continue
        
        source = sources.get(pid, {})
        supplier = source.get('supplier_company', '')
        source_url = source.get('source_url', '')
        collected_on = source.get('collected_on', '2026-10-21')
        
        # 构建 description（包含商家信息和来源）
        desc_parts = []
        if prod['gsm']:
            desc_parts.append(f"克重:{prod['gsm']}")
        if prod['material']:
            desc_parts.append(f"材质:{prod['material']}")
        if prod['remark']:
            desc_parts.append(prod['remark'])
        # 加入商家信息
        if supplier:
            desc_parts.append(f"供应商:{supplier}")
        # 加入来源信息
        if source_url:
            desc_parts.append(f"来源:{source_url}")
            desc_parts.append(f"采集日期:{collected_on}")
        
        description = '; '.join(desc_parts) if desc_parts else ''
        
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
                'description': description[:1000],
            })
    
    # 写入输出文件
    fieldnames = ['sku', 'name', 'category', 'unit', 'currency', 'min_quantity', 'unit_price', 'valid_until', 'description']
    with open(OUTPUT_FILE, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(output_rows)
    
    print(f"修复完成！")
    print(f"  输出行数: {len(output_rows)}")
    print(f"  已删除饮料数据")
    print(f"  已加入商家信息和来源URL")
    print(f"  输出文件: {OUTPUT_FILE}")

if __name__ == '__main__':
    convert()
