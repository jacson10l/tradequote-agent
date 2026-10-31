#!/usr/bin/env python3
import csv, re, os

path = r'C:\Users\lenovo\OneDrive - The University of Nottingham Ningbo China\Desktop\tradequote-agent\wiki-project\demo_data\catalog_converted.csv'
size = os.path.getsize(path)

REQUIRED = ['sku','name','category','unit','currency','min_quantity','unit_price','valid_until','description']
VALID_CURRENCIES = {'USD','EUR','CNY','GBP','JPY'}
UNIT_RE = re.compile(r'^[A-Za-z][A-Za-z0-9_-]{0,31}$')
DECIMAL_RE = re.compile(r'^(?:0|[1-9]\d{0,8})(?:\.\d{1,4})?$')
DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')

issues = []
rows = []
with open(path, 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    if reader.fieldnames != REQUIRED:
        issues.append(f'表头不匹配: 实际={reader.fieldnames}')
    
    for i, row in enumerate(reader, start=2):
        rows.append(row)
        if not (1 <= len(row['sku']) <= 200):
            issues.append(f'行{i}: sku长度超限')
        if not (1 <= len(row['name']) <= 200):
            issues.append(f'行{i}: name长度超限')
        if not UNIT_RE.match(row['unit']):
            issues.append(f'行{i}: unit不合法 {row["unit"]}')
        if row['currency'] not in VALID_CURRENCIES:
            issues.append(f'行{i}: currency不合法 {row["currency"]}')
        if not DECIMAL_RE.match(row['min_quantity']):
            issues.append(f'行{i}: min_quantity格式错误 {row["min_quantity"]}')
        elif float(row['min_quantity']) <= 0:
            issues.append(f'行{i}: min_quantity<=0')
        up = row['unit_price']
        if up != '' and not DECIMAL_RE.match(up):
            issues.append(f'行{i}: unit_price格式错误 {up}')
        if not DATE_RE.match(row['valid_until']):
            issues.append(f'行{i}: valid_until格式错误')
        if len(row['description']) > 1000:
            issues.append(f'行{i}: description超1000字符')

if len(rows) > 500:
    issues.append(f'行数超限: {len(rows)} > 500')
if len(rows) < 1:
    issues.append('行数不足')

sku_tiers = {}
for i, row in enumerate(rows, start=2):
    key = (row['sku'], row['min_quantity'])
    if key in sku_tiers:
        issues.append(f'行{i}: 同SKU重复min_quantity={row["min_quantity"]}')
    else:
        sku_tiers[key] = i

sku_attrs = {}
for i, row in enumerate(rows, start=2):
    sku = row['sku']
    attrs = (row['name'], row['category'], row['unit'], row['currency'], row['valid_until'])
    if sku in sku_attrs and sku_attrs[sku] != attrs:
        issues.append(f'行{i}: SKU {sku} 属性不一致')
    sku_attrs[sku] = attrs

print(f'文件大小: {size/1024:.1f} KB (限制256KB) {"✓" if size <= 262144 else "✗"}')
print(f'数据行数: {len(rows)} (限制1-500) {"✓" if 1 <= len(rows) <= 500 else "✗"}')
print(f'商品SKU数: {len(set(r["sku"] for r in rows))}')
print()
if issues:
    print(f'发现 {len(issues)} 个问题:')
    for iss in issues[:20]:
        print(f'  ✗ {iss}')
else:
    print('✓ 全部通过系统 CatalogRowSchema 验证')
