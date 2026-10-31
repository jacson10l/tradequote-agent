# MDF 板材真实商品采集记录（替换合成占位数据）

> 用途：把 `catalog_converted.csv` / `catalog_demo.csv` 中 MDF-001~MDF-008 的合成占位数据，
> 替换为阿里国际站（alibaba.com）真实商品页采集信息。
> 采集方式：人工在 alibaba.com 截图商品页，2026-10-31 归档。字段以截图为准，不臆造。
> 口径：真实采集、真实性待审核（字段值未逐项人工复核）。

## 截图归档清单（source-archive/）

| 归档文件名 | 对应商品 | 真实 product_id |
| --- | --- | --- |
| mdf-real-01-gloss-mdf-board.jpg | Gloss MDF Board（高光中密度纤维板） | 1601359234640 |
| mdf-real-07-glossy-furniture.jpg | 与 #1 同一商品（合并） | 1601359234640 |
| mdf-real-02-sublimation-placemat.jpg | 中纤板升华餐垫（sublimation placemat） | 1601385909818 |
| mdf-real-04-raw-mdf-beijing.jpg | 原木 MDF 1220×2440 1-30mm | 1601639031491 |
| mdf-real-05-3mm-natural-veneer.jpg | 3mm 天然单板 MDF 制造商 | 1601583725738 |
| mdf-real-06-ultra-thin-waterproof.png | 超薄防水 MDF 板 3mm/6mm | 1601634742061 |
| mdf-real-06-melamine-faced-decor-18mm.png | 环保三聚氰胺贴面 MDF 装饰板 18mm（第二次截图替换） | 1600614614202 |
| mdf-real-03-modern-e0-xinlida.png | 现代设计 E0 MDF 12/15/18mm（Xinlida） | 已作废（未取到 ID，由 #6 melamine 替换） |

## 逐条真实字段

### 1. Gloss MDF Board（合并 #1 与 #7）
- product_id: 1601359234640
- 标题(zh): 价格优惠出口高光泽家具中密度纤维板面板
- 标题(en): Good Price Exporter Gloss MDF Board
- 供应商: Linyi Chanta International Trading Co., Ltd.（Linyi, CN · 12年 · 实力供应商）
- 币种: CNY；单位: sheet
- 阶梯价（CNY）: 500→40.51, 5000→28.13, 500000→13.11
- MOQ: 500 sheets
- 厚度: 12mm / 18mm（另有 3/4/6/8/10/15/25/30/35mm 选项）
- 品种: 中密度纤维板/半硬质纤维板（MDF）；表面: 高光
- 环保/认证: FSC 认证
- URL: https://www.alibaba.com/product-detail/Good-Price-Exporter-Gloss-Mdf-Board_1601359234640.html

### 2. 中纤板升华餐垫（sublimation placemat）
- product_id: 1601385909818
- 标题(zh): 家用中纤板升华餐垫制造商免费样品批发中纤板
- 标题(en): Free Sample Wholesale MDF Board Sublimation (placemat)
- 供应商: Linyi Chanta International Trading Co., Ltd.（Linyi, CN · 12年）
- 币种: CNY；单位: sheet
- 阶梯价（CNY）: 500→40.51, 5000→28.13, 500000→13.11
- MOQ: 500 sheets；厚度: 12mm / 18mm
- 品种: 中密度纤维板/半硬质纤维板；认证: FSC 认证
- URL: https://www.alibaba.com/product-detail/Free-Sample-Wholesale-Mdf-Board-Sublimation_1601385909818.html

### 3. 原木 MDF 1220×2440 1mm-30mm
- product_id: 1601639031491
- 标题(zh): 原木MDF1220*2440 1mm-30mm厚度 纯色环保防潮工业MDF板，用于家具制造
- 标题(en): Raw MDF 1220×2440 1mm-30mm Thickness, Plain Eco Moisture-Resistant Industrial MDF Board
- 供应商: Beijing Green Technology Co., Ltd.（Beijing, CN · 2年）
- 币种: CNY；单位: piece
- 阶梯价（CNY）: 1000→16.48, 5000→14.50
- MOQ: 1000 pieces；厚度: 1-30mm
- 规格: 1220×2440mm；品种: 高/中密度纤维板（可选）
- 认证: FSC 认证；环保: 环保防潮
- URL: https://www.alibaba.com/product-detail/RAW-MDF1220-2440-1mm-30mm-Thickness_1601639031491.html

### 4. 3mm 天然单板 MDF 制造商
- product_id: 1601583725738
- 标题(zh): 中密度纤维板制造商3毫米木材天然板材中密度纤维板材普通生中密度纤维板
- 标题(en): MDF Manufacturer 3mm Wood Natural Veneer Plain Raw MDF Board
- 供应商: Shandong Xinlida Import And Export Trading Co., Ltd.（Liaocheng, CN · 2年 · 实力工厂）
- 币种: CNY；单位: piece
- 阶梯价（CNY）: 50→55.60, 1000→43.02, 10000→19.86
- MOQ: 50 pieces；厚度: 3mm（另 12/18/6/25/9/4/5/8/15mm 选项）
- 品种: 高密度纤维板/硬质纤维板（选中）/ 中密度纤维板/半硬质纤维板
- 认证: FSC PBF 认证、CE；已售 16
- URL: https://www.alibaba.com/product-detail/MDF-Board-Manufacturer-3mm-Wood-Natural_1601583725738.html

### 5. 超薄防水 MDF 板 3mm & 6mm
- product_id: 1601634742061
- 标题(zh): 高品质超薄 MDF 板 3 毫米和 6 毫米厚度防水，适合 DIY 工艺品、墙面装饰
- 标题(en): High Quality Ultra-Thin MDF Sheets 3mm & 6mm Waterproof for DIY Crafts & Wall Decoration
- 供应商: Beijing Green Technology Co., Ltd.（Beijing, CN · 3年）
- 币种: CNY；单位: sheet
- 阶梯价（CNY）: 500→11.98, 2000→11.32, 5000→10.66
- MOQ: 500 sheets；厚度: 3mm / 6mm
- 品种: 高密度纤维板/硬质纤维板；认证: FSC® 认证；已售 500
- URL: https://www.alibaba.com/product-detail/High-Quality-Ultra-Thin-MDF-Sheets_1601634742061.html

### 6. 环保三聚氰胺贴面 MDF 装饰板 18mm（替换品，2026-10-31 第二次截图）
- product_id: 1600614614202
- 标题(zh): 环保型三聚氰胺贴面MDF装饰板18毫米，可定制尺寸和颜色，低甲醛防潮家居家具
- 标题(en): Eco-friendly Melamine Faced MDF Decor Board 18mm Customizable Size and Color Low-formaldehyde
- 供应商: Guangxi Hengxin Yiye Wood Co., Ltd.（Nanning, CN · 7年 · 实力工厂）
- 币种: CNY；单位: piece
- 价格: ¥38.99–238.12（区间价）；样品价 ¥66.19
- MOQ: 1 piece；厚度: 18mm（另 3/4/6/8/9/12/25mm 选项）
- 材质: 木质纤维；品种: 高密度纤维板/硬质纤维板、中密度纤维板/半硬质纤维板
- 表面: 三聚氰胺贴面；环保: E1 低甲醛防潮；用途: 家居家具/室内
- URL: https://www.alibaba.com/product-detail/Eco-Friendly-Melamine-Faced-MDF-Decor_1600614614202.html

> 注：本 SKU 为 2026-10-31 第二次截图替换的商品（原第一次截图的 Xinlida E0 未取到 product_id，已作废不用）。
