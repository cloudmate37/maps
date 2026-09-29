"""Build small Seoul-only web assets from the local SGIS source files.

Uses the Python packages already installed on this computer. Run from any cwd.
"""
from __future__ import annotations

import json
from pathlib import Path

import geopandas as gpd
import pandas as pd
from shapely.geometry import mapping


ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parents[1] / "data"


def rounded(value):
    if isinstance(value, (tuple, list)):
        return [rounded(v) for v in value]
    return round(float(value), 6)


def feature(code, name, gu_code, gu_name, geometry):
    shape = mapping(geometry)
    shape["coordinates"] = rounded(shape["coordinates"])
    label_point = geometry.representative_point()
    return {
        "type": "Feature",
        "properties": {"code": str(code), "name": str(name), "guCode": str(gu_code),
                       "guName": str(gu_name), "labelPoint": rounded((label_point.x, label_point.y))},
        "geometry": shape,
    }


def main():
    OUT.mkdir(exist_ok=True)
    districts = pd.read_excel(ROOT / "adm_code.xls", sheet_name=0, header=1, dtype=str)
    districts = districts[districts["시도코드"] == "11"].copy()
    districts["guCode"] = "11" + districts["시군구코드"]
    districts["dongCode"] = districts["guCode"] + districts["읍면동코드"]
    gu_names = dict(zip(districts.guCode, districts["시군구명칭"]))
    dong_names = dict(zip(districts.dongCode, districts["읍면동명칭"]))

    source = gpd.read_file(ROOT / "bnd_dong_00_2025_2Q.shp")
    source["ADM_CD"] = source.ADM_CD.astype(str)
    seoul = source[source.ADM_CD.str.startswith("11")].copy()
    if len(seoul) != 426 or seoul.ADM_CD.str[:5].nunique() != 25:
        raise ValueError("Unexpected Seoul boundary counts")
    if set(seoul.ADM_CD) != set(dong_names):
        raise ValueError("Boundary and 2025-06 district codes differ")

    # Dissolve the full-resolution source before simplifying district outlines.
    gu = seoul.assign(guCode=seoul.ADM_CD.str[:5]).dissolve(by="guCode")
    seoul = seoul.to_crs(4326)
    gu = gu.to_crs(4326)
    dong_features = [
        feature(row.ADM_CD, dong_names[row.ADM_CD], row.ADM_CD[:5],
                gu_names[row.ADM_CD[:5]], row.geometry.simplify(0.000025, preserve_topology=True))
        for row in seoul.itertuples()
    ]
    gu_features = [
        feature(code, gu_names[code], code, gu_names[code], geom.simplify(0.000025, preserve_topology=True))
        for code, geom in gu.geometry.items()
    ]
    for name, features in (("dong", dong_features), ("gu", gu_features)):
        path = OUT / f"seoul-{name}.geojson"
        path.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                                   ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(path, len(features), path.stat().st_size)

    stats = pd.read_excel(ROOT / "statistics_code.xls", sheet_name=0, header=1, dtype=str)
    stat_names = dict(zip(stats["코드"].dropna(), stats.loc[stats["코드"].notna(), "통계항목"]))
    (OUT / "statistics.json").write_text(json.dumps(stat_names, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
