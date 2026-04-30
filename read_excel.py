import pandas as pd
import json

try:
    df_dict = pd.read_excel('劳务排班.xlsx', sheet_name=None)
    res = {}
    for sheet_name, df in df_dict.items():
        res[sheet_name] = df.fillna("").to_dict(orient="records")
        
    with open('output.json', 'w', encoding='utf-8') as f:
        json.dump(res, f, ensure_ascii=False, indent=2)
except Exception as e:
    with open('output.json', 'w', encoding='utf-8') as f:
        f.write(str(e))
