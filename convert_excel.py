import pandas as pd
import re

def parse_cell(val):
    val_str = str(val).strip()
    if not val_str or val_str.lower() == 'nan':
        return 0, ""
    
    # Match leading number and trailing text
    m = re.match(r'^(\d+(?:\.\d+)?)(.*)', val_str)
    if m:
        return float(m.group(1)), m.group(2).strip()
    
    # Maybe it's just pure text
    return 0, val_str

def process_excel():
    df_dict = pd.read_excel('劳务排班.xlsx', sheet_name=None)
    
    # Assuming data is in the first sheet
    sheet_name = list(df_dict.keys())[0]
    df = df_dict[sheet_name]
    records = df.fillna("").to_dict(orient="records")
    
    out_data = []
    
    company = "J&S"
    shift_name = ""
    
    col_keys = [f"Unnamed: {i}" for i in range(1, 8)]
    
    for row in records:
        col0 = str(row.get(list(row.keys())[0], "")).strip()
        if not col0:
            continue
            
        is_empty_data = True
        for key in col_keys:
            val = str(row.get(key, "")).strip()
            # Ignore placeholder headers
            if val and val not in ["Mon", "Tue", "Wed.", "Thur.", "Fri.", "Sat.", "Sun."]:
                is_empty_data = False
                break
                
        if is_empty_data:
            lower_col0 = col0.lower()
            if "schedule" in lower_col0:
                if "aas" in lower_col0: company = "AAS"
                elif "uns" in lower_col0: company = "UNS"
                elif "great fast" in lower_col0: company = "Great Fast"
                elif "reliant" in lower_col0: company = "Reliant"
                elif "hr-es" in lower_col0: company = "HR-ES"
                elif "direct job" in lower_col0: company = "Direct Job"
                elif "j&s" in lower_col0: company = "J&S"
                shift_name = "" # reset shift
            elif "am" in lower_col0 or "pm" in lower_col0 or "shift" in lower_col0:
                # remove leading numbers like "1， "
                shift_name = re.sub(r'^\d+[，,]\s*', '', col0)
            continue
            
        # It is a data row
        days_data = []
        notes = set()
        
        for key in col_keys:
            val = str(row.get(key, "")).strip()
            num, note = parse_cell(val)
            days_data.append(num)
            if note:
                notes.add(note)
                
        note_str = ", ".join(sorted(list(notes)))
        
        out_data.append({
            "劳务公司/归属": company,
            "班次名称": shift_name,
            "岗位/工作内容": col0,
            "星期一": days_data[0],
            "星期二": days_data[1],
            "星期三": days_data[2],
            "星期四": days_data[3],
            "星期五": days_data[4],
            "星期六": days_data[5],
            "星期日": days_data[6],
            "单位/备注": note_str
        })
        
    out_df = pd.DataFrame(out_data)
    out_df.to_excel('新版排班表.xlsx', index=False)
    print("Successfully created 新版排班表.xlsx")

if __name__ == "__main__":
    process_excel()
