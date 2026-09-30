"""Build Seoul legal-dong boundaries using the computer's installed packages."""
import json
from pathlib import Path

import geopandas as gpd
import pandas as pd
from build_data import OUT, ROOT, feature


def main():
    source_dir = ROOT.parent / "Geopandas"
    source = gpd.read_file(source_dir / "LSMD_ADM_SECT_UMD_11.shp", encoding="cp949")
    names = pd.read_csv(source_dir / "법정동코드.csv", dtype=str)
    legal_gu = dict(zip(names.SGG_CD, names.SGG_NM))
    adm = pd.read_excel(ROOT / "adm_code.xls", header=1, dtype=str)
    adm = adm[adm["시도코드"] == "11"]
    gu_codes = dict(zip(adm["시군구명칭"], "11" + adm["시군구코드"]))
    source = source.to_crs(4326)
    if not source.EMD_CD.is_unique or source.COL_ADM_SE.nunique() != 25:
        raise ValueError("Unexpected legal-dong codes or district count")
    features = []
    for row in source.itertuples():
        gu_name = legal_gu[row.COL_ADM_SE]
        item = feature(row.EMD_CD, row.EMD_NM, gu_codes[gu_name], gu_name,
                       row.geometry.simplify(0.000025, preserve_topology=True))
        item["properties"]["legalGuCode"] = row.COL_ADM_SE
        features.append(item)
    path = OUT / "seoul-legal.geojson"
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                              ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(path, len(features), path.stat().st_size)


if __name__ == "__main__":
    main()
