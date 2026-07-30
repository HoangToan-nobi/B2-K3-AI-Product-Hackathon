#!/usr/bin/env python3
"""Boc review-pack.json that thanh 1 file JS gan window.REAL_REVIEW_PACK, de frontend
tinh (mo bang file://, khong can chay server) van doc duoc du lieu AI that.

Dung: python3 07_export_frontend_data.py <review-pack.json> <output.js>
"""
import json
import sys


def main():
    if len(sys.argv) != 3:
        print("Dung: python3 07_export_frontend_data.py <review-pack.json> <output.js>")
        sys.exit(1)
    pack_path, out_path = sys.argv[1:3]

    with open(pack_path, encoding="utf-8") as f:
        pack = json.load(f)

    js = "// Sinh tu dong boi 07_export_frontend_data.py — KHONG sua tay, chay lai pipeline neu can cap nhat.\n"
    js += "window.REAL_REVIEW_PACK = " + json.dumps(pack, ensure_ascii=False, indent=2) + ";\n"

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(js)

    print(f"Da ghi -> {out_path}")


if __name__ == "__main__":
    main()
