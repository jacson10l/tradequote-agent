# demo-tools（历史数据加工脚本存档）

本目录存放演示数据包（`wiki-project/demo_data/`）在加工阶段使用的一次性 Python 脚本，**不属于正式演示资料包**，仅留档备查。

## 说明

- 这些脚本的产物已落盘为 `demo_data/` 下的正式 CSV，脚本本身不再参与演示路径。
- 脚本内路径多为硬编码（部分含本机 OneDrive 绝对路径），**不可直接复用**，如需重新生成/校验目录数据，请先核对并修正路径。
- 与正式演示无直接关系，不纳入 `file-provenance.json` 或 `archivalMarkdown` 登记。

## 文件清单

| 文件 | 作用 |
| --- | --- |
| `convert_to_catalog.py` | 由 `demo_products.csv` + `demo_price_tiers.csv` 生成 `catalog_converted.csv` |
| `fix_catalog.py` | 修正目录数据（合并 `demo_products_sources.csv` 等来源） |
| `validate_catalog.py` | 校验目录 CSV 格式与字段 |
| `full_validate.py` | 完整校验 CSV 是否满足项目红线要求 |
| `add_drinks.py` | 追加饮料品类样例（注意：饮料数据因无真实来源 URL 违反「真实可溯源」红线） |
| `add_mdf_bolt.py` | 追加板材/紧固件品类样例 |
| `compliance_check.py` | 合规检查脚本 |

> 注：`demo_products.xlsx` 为 `demo_products.csv` 的重复格式，已删除，如需可从此脚本重新导出。
