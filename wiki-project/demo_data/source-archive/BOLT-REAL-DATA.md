# 紧固件（六角螺栓）真实商品采集记录（替换合成占位数据）

> 用途：把 `catalog_converted.csv` / `catalog_demo.csv` 中 BOLT-001~BOLT-008 的合成占位数据，
> 替换为阿里国际站（alibaba.com）真实商品页采集信息。
> 采集方式：人工在 alibaba.com 截图商品页（每张截图顶部地址栏含完整 URL），2026-10-31 归档。
> 口径：真实采集、真实性待审核（字段值未逐项人工复核，不臆造）。

## 截图归档清单（source-archive/）

| 归档文件名 | 商品 | product_id（地址栏所见） |
| --- | --- | --- |
| bolt-real-01-din933-stainless-m6-m8-m10.png | DIN933 不锈钢六角螺栓 M6/M8/M10 | 1600593893760 |
| bolt-real-02-grade8-ss304-316-m5-m10.png | 8级 SS304/SS316 六角螺栓 M5/M6/M8/M10 | 1601578319241 |
| bolt-real-03-316-hex-bolt-nut-washer.png | 316 六角螺栓螺母垫圈 M3/M6/M10 | 62245798159（11 位，按截图原样） |
| bolt-real-04-din912-socket-cap-8.8-12.9.png | DIN912 内六角螺栓 8.8/10.9/12.9 M4-M24 | 1601512254159（11 位，按截图原样） |
| bolt-real-05-carbon-steel-din933-931-8.8-12.9.png | 碳钢六角螺栓 DIN933/931 8.8/10.9/12.9 | 1600961286215（地址栏截断，ID 边界存疑） |
| bolt-real-06-din933-a2-70-ss304.png | DIN933 A2-70 不锈钢 SS304 六角螺栓 | 1601382262416 |
| bolt-real-07-din6921-flange-bolt.jpg | DIN6921 六角法兰螺栓 碳钢/不锈钢 | 1600763733044（11 位，按截图原样） |

## 逐条真实字段

### 1. DIN933 不锈钢六角螺栓 M6/M8/M10
- product_id: 1600593893760
- 标题(zh): 紧固件产品din933六角螺栓m6 m8 m10全螺纹不锈钢六角螺栓
- 供应商: Taizhou Fengye Metal Products Co., Ltd.（China）
- 币种: CNY；单位: piece
- 阶梯价: 1000→0.331, 10000→0.2648
- MOQ: 1000 pieces；材质: 不锈钢 A2/A4；标准: DIN933；螺纹 M2-M42；长度 6-150mm；表面: Plain
- URL: https://www.alibaba.com/product-detail/Fastener-Product-Din933-Hex-Bolt-M6_1600593893760.html

### 2. 8级 SS304/SS316 六角螺栓 M5/M6/M8/M10
- product_id: 1601578319241
- 标题(zh): 制造商生产的8级不锈钢M5 M6 M8 M10螺栓和六角螺母紧固件 SS304/SS316
- 供应商: Jiaxing Haina Fastener Co., Limited（Jiaxing, CN · 12年）
- 币种: CNY；单位: piece
- 阶梯价: 1000→0.1986, 10000→0.1324
- MOQ: 1000 pieces；材质: SS304/SS316；规格: M4/M5/M6/M7/M8/M10/M12；长度 20-60mm
- URL: https://www.alibaba.com/product-detail/Grade-8-Stainless-Steel-M5-M6_1601578319241.html

### 3. 316 六角螺栓螺母垫圈 M3/M6/M10
- product_id: 62245798159（11 位，按截图原样）
- 标题(zh): 制造不锈钢316六角螺栓和螺母平垫圈304 M3 M6 M10 DIN933
- 供应商: Jiaxing Goshen Hardware Co., Ltd.（Jiaxing, CN）
- 币种: CNY；单位: piece
- 阶梯价: 1000→0.331, 10000→0.1986, 50000→0.1324
- MOQ: 1000 pieces；材质: 不锈钢 316（螺母/垫圈 304）；标准: DIN933；螺纹 M5/M5.5/M6/M6.3/M7/M8
- URL: https://www.alibaba.com/product-detail/Manufacture-Stainless-Steel-316-Hex-Bolt_62245798159.html

### 4. DIN912 内六角螺栓 8.8/10.9/12.9 M4-M24
- product_id: 1601512254159（11 位，按截图原样）
- 标题(zh): 黑色内六角螺栓8.8级10.9 12.9杯头六角内六角螺栓Din912 M4 M6 M8 M10-M24
- 供应商: Jiaxing Goshen Hardware Co., Ltd.（Jiangsu, CN）
- 币种: CNY；单位: piece
- 阶梯价: 1000→0.2648, 5000→0.1986, 10000→0.0662
- MOQ: 1000 pieces；材质: 碳钢/合金钢；等级: 8.8/10.9/12.9；标准: DIN912；螺纹 M4-M24
- URL: https://www.alibaba.com/product-detail/Black-L-Key-Allen-Bolt-Grade_1601512254159.html

### 5. 碳钢六角螺栓 DIN933/931 8.8/10.9/12.9
- product_id: 1600961286215（地址栏截断，ID 边界存疑）
- 标题(zh): 专业制造碳钢螺栓和螺母结构六角螺栓M6 M8 M10公制等级8.8/10.9/12.9 DIN933/931
- 供应商: Hebei Rongfe Fastener Manufacturing Co., Ltd.（Handan, CN）
- 币种: CNY；单位: piece
- 阶梯价: 1000→0.331, 5000→0.1986, 10000→0.1324, 20000→0.0662
- MOQ: 1000 pieces；材质: 碳钢；等级: 8.8/10.9/12.9；标准: DIN933/DIN931；样品价 ¥6.62
- URL: https://www.alibaba.com/product-detail/Professional-Manufacture-Carbon-Steel-Bolt-and-_1600961286215.html（末尾 ID 边界待核）

### 6. DIN933 A2-70 不锈钢 SS304 六角螺栓
- product_id: 1601382262416
- 标题(zh): 工厂DIN933 A2-70不锈钢SS304螺栓和螺母M5 M6 M8 M10内六角螺栓镀锌六角螺栓
- 供应商: Jiaxing Haina Fastener Co., Limited（Jiaxing, CN · 12年）
- 币种: CNY；单位: piece
- 阶梯价: 1000→3.91, 10000→1.86
- MOQ: 1000 pieces；材质: SS304（A2-70）；标准: DIN933；表面: 镀锌；样品价 ¥13.24
- URL: https://www.alibaba.com/product-detail/Factory-DIN933-A2-70-Stainless-Steel_1601382262416.html

### 7. DIN6921 六角法兰螺栓 碳钢/不锈钢
- product_id: 1600763733044（11 位，按截图原样）
- 标题(zh): LEKON DIN6921 六角法兰螺栓 碳钢和不锈钢 M5 M6 M8 M10 M12
- 供应商: Foshan Zhongqin Likang Hardware Co., Ltd.（Foshan, China）
- 币种: CNY；单位: piece
- 阶梯价: 100→0.4633, 10000→0.1986, 100000→0.0662
- MOQ: 100 pieces；材质: 碳钢/不锈钢；标准: DIN6921；规格: M5/M6/M8/M10/M12
- URL: https://www.alibaba.com/product-detail/LEKON-DIN6921-Hexagon-Flange-Bolt-Carbon_1600763733044.html
