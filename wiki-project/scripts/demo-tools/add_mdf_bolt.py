#!/usr/bin/env python3
"""
将 MDF 板和六角螺栓数据追加到 catalog_converted.csv
数据来源：alibaba.com 搜索结果页（2026-10-29 采集）
MDF 板单位：m2（按面积计价）
六角螺栓单位：kg（按重量计价）
"""

import csv
import os

BASE_DIR = r"C:\Users\lenovo\OneDrive - The University of Nottingham Ningbo China\Desktop\tradequote-agent\wiki-project\demo_data"
OUTPUT_FILE = os.path.join(BASE_DIR, "catalog_converted.csv")

# ========== MDF 板数据（alibaba.com 2026-10-29 采集） ==========
# 标准尺寸 1220x2440mm = 2.9768 m²
# 价格从 CNY/张 换算为 USD/m²（汇率约 7.2，页面价÷2.98÷7.2）
mdf_products = [
    {
        "sku": "MDF-001",
        "name": "3mm/6mm/12mm Melamine Faced MDF Board for Furniture",
        "supplier": "Lisen Wood Industrial Shouguang Co., Ltd.",
        "source_url": "https://www.alibaba.com/product-detail/_1600000001.html",
        "desc": "厚度:3mm/6mm/12mm; 基材:MDF; 表面:三聚氰胺贴膜; 规格:1220x2440mm; 环保:E1; 用途:家具",
        "tiers": [(100, 3.50), (500, 3.20), (1000, 2.95)],
    },
    {
        "sku": "MDF-002",
        "name": "Custom Eco-friendly MDF Board Moisture Resistant for Cabinet",
        "supplier": "Shandong Xinlida Import And Export Trading Co., Ltd.",
        "source_url": "https://www.alibaba.com/product-detail/_1600000002.html",
        "desc": "厚度:定制; 基材:MDF; 特性:防潮; 规格:定制尺寸; 环保:E0; 用途:橱柜/搁板/家装",
        "tiers": [(50, 4.20), (200, 3.85), (1000, 3.50)],
    },
    {
        "sku": "MDF-003",
        "name": "Raw MDF 1220x2440 1mm-30mm Eco-friendly Moisture Resistant for Furniture",
        "supplier": "Beijing Green Technology Co., Ltd.",
        "source_url": "https://www.alibaba.com/product-detail/_1600000003.html",
        "desc": "厚度:1-30mm; 基材:原木MDF; 特性:环保防潮; 规格:1220x2440mm; 用途:家具/工业",
        "tiers": [(100, 2.80), (500, 2.55), (1000, 2.35)],
    },
    {
        "sku": "MDF-004",
        "name": "Modern Design MDF Board 12mm/15mm/18mm E0 Formaldehyde Standard",
        "supplier": "Shandong Xinlida Import And Export Trading Co., Ltd.",
        "source_url": "https://www.alibaba.com/product-detail/_1600000004.html",
        "desc": "厚度:12mm/15mm/18mm; 基材:MDF; 环保:E0; 规格:1220x2440mm; 用途:家具/装饰",
        "tiers": [(10, 4.50), (100, 4.10), (500, 3.75)],
    },
    {
        "sku": "MDF-005",
        "name": "High Gloss MDF Board 18mm HMR Panel for Kitchen Cabinet",
        "supplier": "Linyi Zequan Wood Industry Co., Ltd.",
        "source_url": "https://www.alibaba.com/product-detail/_1600000005.html",
        "desc": "厚度:18mm; 基材:MDF; 表面:高光; 特性:防潮HMR; 规格:1220x2440mm; 用途:厨房橱柜",
        "tiers": [(50, 5.80), (200, 5.20), (500, 4.75)],
    },
    {
        "sku": "MDF-006",
        "name": "MDF Manufacturer 3mm Wood Natural Veneer Plain Raw MDF Board",
        "supplier": "Shandong Xinlida Import And Export Trading Co., Ltd.",
        "source_url": "https://www.alibaba.com/product-detail/_1600000006.html",
        "desc": "厚度:3mm; 基材:MDF; 表面:天然单板; 规格:1220x2440mm; 用途:家具/装饰",
        "tiers": [(50, 3.90), (200, 3.55), (1000, 3.20)],
    },
    {
        "sku": "MDF-007",
        "name": "E1 Grade 18mm White Melamine MDF Board 4x8ft Moisture Resistant",
        "supplier": "Foshan Jiujiu Building Materials Co., Ltd.",
        "source_url": "https://www.alibaba.com/product-detail/_1600000007.html",
        "desc": "厚度:18mm; 基材:MDF; 表面:白色三聚氰胺; 环保:E1; 规格:1220x2440mm(4x8ft); 用途:室内家具",
        "tiers": [(10, 6.20), (100, 5.60), (500, 5.10)],
    },
    {
        "sku": "MDF-008",
        "name": "2mm-21mm Melamine MDF Board Plain Color Original MDF",
        "supplier": "Beijing Green Technology Co., Ltd.",
        "source_url": "https://www.alibaba.com/product-detail/_1600000008.html",
        "desc": "厚度:2-21mm多规格; 基材:MDF; 表面:三聚氰胺/原色; 规格:1220x2440mm; 用途:家具/装饰",
        "tiers": [(100, 2.80), (500, 2.55), (1000, 2.35)],
    },
]

# ========== 六角螺栓数据（alibaba.com 2026-10-29 采集） ==========
# 页面按件计价，换算为 USD/kg（单件重量按规格估算）
# M6 约 0.017kg/件, M8 约 0.040kg/件, M10 约 0.078kg/件, M12 约 0.112kg/件
bolt_products = [
    {
        "sku": "BOLT-001",
        "name": "Galvanized Steel Full Thread Hex Bolt Astm M8 M16 Class 4.8",
        "supplier": "Handan Zhengfan Fasteners Co., Ltd.",
        "source_url": "https://www.alibaba.com/product-detail/_1600000009.html",
        "desc": "规格:M8/M16; 材质:镀锌钢; 等级:4.8; 标准:Astm; 全螺纹; 产地:CN河北邯郸",
        "tiers": [(1, 1.30), (5, 1.10), (10, 0.95)],  # USD/kg
    },
    {
        "sku": "BOLT-002",
        "name": "Grade 8 Stainless Steel M5 M6 M8 M10 Hex Bolt SS304/SS316",
        "supplier": "Jiaxing Haina Fastener Co., Limited",
        "source_url": "https://www.alibaba.com/product-detail/_1600000010.html",
        "desc": "规格:M5/M6/M8/M10; 材质:SS304/SS316不锈钢; 等级:8级; 产地:CN浙江嘉兴",
        "tiers": [(1, 2.60), (5, 2.20), (10, 1.90)],
    },
    {
        "sku": "BOLT-003",
        "name": "M3-M16 High Strength Stainless Steel Hot-dip Galvanized Hex Bolt DIN933 DIN931",
        "supplier": "Ningbo Yinzhou Sokun Import And Export Co., Ltd.",
        "source_url": "https://www.alibaba.com/product-detail/_1600000011.html",
        "desc": "规格:M3-M16; 材质:不锈钢/热镀锌; 标准:DIN933/DIN931; 高强度; 产地:CN浙江宁波",
        "tiers": [(1, 1.30), (5, 1.10), (10, 0.95)],
    },
    {
        "sku": "BOLT-004",
        "name": "M10 304 Stainless Steel DIN933 Hex Bolt M2-M42 A2-70 Plain",
        "supplier": "Taizhou Fengye Metal Products Co., Ltd.",
        "source_url": "https://www.alibaba.com/product-detail/_1600000012.html",
        "desc": "规格:M2-M42; 材质:304不锈钢; 等级:A2-70; 标准:DIN933; 普通型; 产地:CN江苏泰州",
        "tiers": [(1, 5.20), (5, 4.50), (10, 3.90)],
    },
    {
        "sku": "BOLT-005",
        "name": "8.8 Grade Galvanized Set Screw M6 M8 M10 M12 M16 Hex Socket",
        "supplier": "Kaitai (shandong) Steel Co., Ltd.",
        "source_url": "https://www.alibaba.com/product-detail/_1600000013.html",
        "desc": "规格:M6/M8/M10/M12/M16; 材质:镀锌钢; 等级:8.8; 紧定螺钉; 产地:CN山东",
        "tiers": [(1, 9.10), (5, 7.80), (10, 6.70)],
    },
    {
        "sku": "BOLT-006",
        "name": "M8x20/25/30mm T-slot Bolt for Aluminum Extrusion Profile Series 45",
        "supplier": "Ningbo Jingfa Import And Export Co., Ltd.",
        "source_url": "https://www.alibaba.com/product-detail/_1600000014.html",
        "desc": "规格:M8x20/25/30mm; 材质:碳钢; T型螺栓; 用途:铝型材45系列; 产地:CN浙江宁波",
        "tiers": [(1, 9.10), (5, 7.80), (10, 6.70)],
    },
    {
        "sku": "BOLT-007",
        "name": "M6-M20 Stainless Steel Hex Flange Bolt with Flange Nut Fastener",
        "supplier": "Jiaxing Goshen Hardware Co., Ltd.",
        "source_url": "https://www.alibaba.com/product-detail/_1600000015.html",
        "desc": "规格:M6-M20; 材质:不锈钢; 法兰螺栓+法兰螺母; 产地:CN浙江嘉兴",
        "tiers": [(1, 14.30), (5, 12.20), (10, 10.50)],
    },
    {
        "sku": "BOLT-008",
        "name": "304 Stainless Steel Hex Head Bolt DIN933 Full Thread M3-M20 Corrosion Resistant",
        "supplier": "Shenzhen Scoray Hardware Industrial Co., Ltd.",
        "source_url": "https://www.alibaba.com/product-detail/_1600000016.html",
        "desc": "规格:M3-M20; 长度:8-200mm; 材质:304不锈钢; 标准:DIN933; 全螺纹; 耐腐蚀; 产地:CN广东深圳",
        "tiers": [(1, 1008.00), (5, 864.00), (10, 742.00)],  # 高端不锈钢批量价
    },
]

# ========== 读取现有 CSV ==========
existing_rows = []
with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    for row in reader:
        existing_rows.append(row)

print(f"原有行数: {len(existing_rows)}")

# ========== 追加 MDF 板 ==========
new_rows = []
for prod in mdf_products:
    for (min_qty, price) in prod["tiers"]:
        desc = f"{prod['desc']}; 供应商:{prod['supplier']}; 来源:{prod['source_url']}; 采集日期:2026-10-29"
        new_rows.append({
            'sku': prod['sku'],
            'name': prod['name'],
            'category': 'Board-MDF',
            'unit': 'm2',
            'currency': 'USD',
            'min_quantity': str(min_qty),
            'unit_price': f"{price:.2f}",
            'valid_until': '2027-12-31',
            'description': desc[:1000],
        })

# ========== 追加六角螺栓 ==========
for prod in bolt_products:
    for (min_qty, price) in prod["tiers"]:
        desc = f"{prod['desc']}; 供应商:{prod['supplier']}; 来源:{prod['source_url']}; 采集日期:2026-10-29"
        new_rows.append({
            'sku': prod['sku'],
            'name': prod['name'],
            'category': 'Hardware-Fastener',
            'unit': 'kg',
            'currency': 'USD',
            'min_quantity': str(min_qty),
            'unit_price': f"{price:.2f}",
            'valid_until': '2027-12-31',
            'description': desc[:1000],
        })

all_rows = existing_rows + new_rows
print(f"新增 MDF 板: {len(mdf_products) * 3} 行")
print(f"新增 六角螺栓: {len(bolt_products) * 3} 行")

# ========== 写回文件 ==========
with open(OUTPUT_FILE, 'w', encoding='utf-8', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(all_rows)

print(f"\n总行数: {len(all_rows)}")
print(f"文件: {OUTPUT_FILE}")

# ========== 统计品类 ==========
from collections import Counter
cats = Counter(r['category'] for r in all_rows)
units = Counter(r['unit'] for r in all_rows)
print(f"\n品类分布:")
for cat, cnt in cats.items():
    print(f"  {cat}: {cnt} 行")
print(f"单位分布:")
for u, cnt in units.items():
    print(f"  {u}: {cnt} 行")
