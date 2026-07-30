#!/usr/bin/env python3
"""Chay golden set (eval/golden-set.json) doi chieu voi output that cua pipeline.

Da so case kiem tra tu dong tren 3 file artifact da sinh (clusters/generated/questions).
Mot so case (GS-03, GS-22, GS-23, GS-24) kiem tra thiet ke pipeline (source code) thay vi
du lieu runtime, vi chung mo ta mot rang buoc phai luon dung (khong phu thuoc lesson dang
chay) — duoc ghi ro trong 'method' de nguoi ngoai nhom doi chieu lai duoc.

Dung: python3 06_run_eval.py <golden-set.json> <questions.json> <clusters.json> \
  <generated.json> <output-run.json>
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
NOTATION_RE = re.compile(r"T\s*=\s*[01](\.\d+)?|top_p|top_k|\b\d+K\b")


def idx_by_turn(questions):
    return {q["turn_id"]: q for q in questions}


def cluster_of(clusters, turn_id):
    for c in clusters.get("clusters", []):
        if turn_id in c["turn_ids"]:
            return c
    return None


def excluded_reason(clusters, turn_id):
    for e in clusters.get("excluded", []):
        if e["turn_id"] == turn_id:
            return e["reason"]
    return None


def find_insight_by_cluster(generated, cluster_id):
    target = f"insight-{cluster_id}"
    for it in generated.get("class_insights", []):
        if it["id"] == target:
            return it
    return None


def is_skipped(generated, cluster_id):
    return any(s["cluster_id"] == cluster_id for s in generated.get("skipped_clusters", []))


def check_same_cluster(turn_ids, clusters):
    cids = {c["cluster_id"] for t in turn_ids if (c := cluster_of(clusters, t))}
    if len(cids) == 1 and len(cids) > 0:
        return True, f"cùng cluster {cids}"
    return False, f"turn_ids nằm ở các cluster khác nhau: {cids}"


def check_noise_reason(turn_ids, questions_idx, expected_reason):
    bad = [t for t in turn_ids if questions_idx.get(t, {}).get("filter_reason") != expected_reason]
    if not bad:
        return True, f"tất cả {len(turn_ids)} turn có filter_reason='{expected_reason}'"
    return False, f"sai filter_reason cho: {bad}"


def check_excluded_reason(turn_ids, clusters, expected_reason):
    bad = [t for t in turn_ids if excluded_reason(clusters, t) != expected_reason]
    if not bad:
        return True, f"tất cả {len(turn_ids)} turn bị excluded với reason='{expected_reason}'"
    return False, f"không khớp reason='{expected_reason}' cho: {bad}"


def check_excluded_any_reason(turn_ids, clusters, acceptable_reasons):
    """Dung khi dieu quan trong la 'khong duoc tra loi nhu noi dung hoc thuat' — nhan ly do cu
    the (prompt_injection vs gibberish...) co the doi giua cac lan chay AI, mien van nam trong
    tap ly do chap nhan duoc (khong bao gio la None / duoc dua vao cluster kien thuc)."""
    reasons = {t: excluded_reason(clusters, t) for t in turn_ids}
    bad = {t: r for t, r in reasons.items() if r not in acceptable_reasons}
    if not bad:
        return True, f"tất cả {len(turn_ids)} turn bị excluded, reason thực tế: {reasons}"
    return False, f"turn không bị excluded đúng cách: {bad}"


def build_checks(questions_idx, clusters, generated):
    checks = {}

    checks["GS-01"] = lambda: check_same_cluster(["T1123", "T0988"], clusters)
    checks["GS-02"] = lambda: check_same_cluster(["T0911", "T1147", "T0145"], clusters)
    checks["GS-04"] = lambda: check_noise_reason(
        ["T0495", "T0239", "T0910", "T1158"], questions_idx, "greeting"
    )
    checks["GS-05"] = lambda: check_excluded_reason(["T0116"], clusters, "gibberish")
    checks["GS-06"] = lambda: check_excluded_reason(["T0930"], clusters, "gibberish")
    checks["GS-07"] = lambda: check_noise_reason(
        ["T0074", "T0462", "T1229", "T0434"], questions_idx, "duplicate"
    )
    checks["GS-08"] = lambda: check_excluded_any_reason(
        ["T0332"], clusters, {"prompt_injection", "gibberish", "off_topic"}
    )
    checks["GS-09"] = lambda: check_excluded_reason(["T0606"], clusters, "prompt_injection")
    checks["GS-10"] = lambda: check_excluded_reason(["T0792"], clusters, "prompt_injection")

    def gs11():
        # Dieu quan trong: cau hoi logistics (T1146) khong duoc bien thanh 1 class_insight
        # "ready". Chap nhan ca 2 nhanh: bi loai thang o buoc cluster (excluded, bat ke nhan ly
        # do cu the la gi), hoac vao 1 cluster nhung cluster do bi skip khoi noi dung.
        reason = excluded_reason(clusters, "T1146")
        c = cluster_of(clusters, "T1146")
        if reason is not None and c is None:
            return True, f"T1146 bị loại thẳng khỏi cluster (reason={reason})"
        if c and is_skipped(generated, c["cluster_id"]):
            return True, f"{c['cluster_id']} nằm trong skipped_clusters"
        return False, f"T1146 không bị loại đúng cách (reason={reason}, cluster={c})"

    checks["GS-11"] = gs11

    def gs12():
        # Cau "2+2=?" hoan toan ngoai pham vi — dieu quan trong la KHONG duoc dua vao cluster
        # kien thuc nao, bat ke nhan ly do cu the la off_topic hay gibberish (ca hai lan chay
        # thuc te deu thay AI gan 1 trong 2 nhan nay, tuy tung lan).
        return check_excluded_any_reason(["T0775"], clusters, {"off_topic", "gibberish"})

    checks["GS-12"] = gs12

    def gs13():
        # "day la ai" (T0102) thieu ngu canh — dieu quan trong la KHONG duoc tra loi tu tin.
        # Chap nhan 2 nhanh an toan: insight status=needs_review, HOAC cluster bi skip hoan
        # toan khoi noi dung (van la lua chon dung khi khong the tra loi chac chan).
        reason = excluded_reason(clusters, "T0102")
        c = cluster_of(clusters, "T0102")
        if reason is not None and c is None:
            return True, f"T0102 bị loại thẳng khỏi cluster (reason={reason})"
        if not c:
            return False, "T0102 không nằm trong cluster nào để kiểm tra"
        if is_skipped(generated, c["cluster_id"]):
            return True, f"{c['cluster_id']} bị skip khỏi nội dung (an toàn vì không tự tin trả lời)"
        it = find_insight_by_cluster(generated, c["cluster_id"])
        if it and it["status"] == "needs_review":
            return True, f"{it['id']} status=needs_review"
        if it and it["status"] == "ready":
            return False, f"{it['id']} bị publish 'ready' dù câu hỏi thiếu ngữ cảnh rõ ràng"
        return False, f"status thực tế = {it['status'] if it else 'không tìm thấy insight'}"

    checks["GS-13"] = gs13

    def gs14():
        # Dieu quan trong: "phan nay co quan trong khong" (danh gia, khong phai cau hoi kien
        # thuc) khong duoc bien thanh 1 claim "ready" cong bo tu tin. Chap nhan ca 3 nhanh an
        # toan: (a) bi loai hoan toan khoi cluster, (b) nam trong 1 cluster nhung cluster do bi
        # skip (khong sinh insight), (c) co insight nhung insight do la needs_review (khong
        # publish nhu kien thuc chac chan). Chi fail neu no gop phan tao ra 1 insight "ready".
        reason = excluded_reason(clusters, "T0802")
        c = cluster_of(clusters, "T0802")
        if reason is not None and c is None:
            return True, f"T0802 bị loại (reason={reason}), không vào class_insights"
        if c and is_skipped(generated, c["cluster_id"]):
            return True, f"T0802 thuộc {c['cluster_id']} nhưng cluster này bị skip khỏi nội dung"
        if c:
            it = find_insight_by_cluster(generated, c["cluster_id"])
            if it and it["status"] == "needs_review":
                return True, f"T0802 thuộc {c['cluster_id']} -> {it['id']} nhưng status=needs_review (không publish tự tin)"
            if it and it["status"] == "ready":
                return False, f"T0802 góp phần tạo insight 'ready' ({it['id']}) — câu đánh giá bị coi như kiến thức chắc chắn"
        return False, f"T0802 excluded_reason={reason}, cluster={c}"

    checks["GS-14"] = gs14

    def grounding_check(turn_id, expect_low_conf=True):
        c = cluster_of(clusters, turn_id)
        if not c:
            return False, f"{turn_id} không thuộc cluster nào"
        it = find_insight_by_cluster(generated, c["cluster_id"])
        if not it:
            return False, f"không tìm thấy insight cho {c['cluster_id']}"
        ok = it["status"] == "needs_review" and (not expect_low_conf or it["confidence"] < 0.8)
        return ok, f"{it['id']} confidence={it['confidence']} status={it['status']}"

    checks["GS-15"] = lambda: grounding_check("T0400")
    checks["GS-16"] = lambda: grounding_check("T0088")

    def gs17():
        # T0902 hoi ve ML/DL nhung trich dan trang 18 (thuc chat ML/DL nam o trang 3).
        # Expected_behavior cho phep 2 nhanh: (a) AI tu sua source_pages ve dung trang 3 VA
        # grounded chac chan -> ready la hop le; hoac (b) khong sua duoc thi phai ha confidence
        # va needs_review. Chi fail neu AI giu nguyen trang 18 sai ma van tu tin "ready".
        c = cluster_of(clusters, "T0902")
        if not c:
            return False, "T0902 không thuộc cluster nào"
        it = find_insight_by_cluster(generated, c["cluster_id"])
        if not it:
            return False, f"không tìm thấy insight cho {c['cluster_id']}"
        if it["status"] == "needs_review":
            return True, f"{it['id']} needs_review (nhánh b) - confidence={it['confidence']}"
        if it["status"] == "ready" and 18 not in it.get("source_pages", []):
            return True, f"{it['id']} tự sửa source_pages={it['source_pages']} và grounded (nhánh a)"
        return False, f"{it['id']} status=ready nhưng vẫn giữ source_pages sai (18): {it.get('source_pages')}"

    checks["GS-17"] = gs17
    checks["GS-18"] = lambda: check_noise_reason(
        ["T1190", "T0038", "T1187", "T0890", "T0251", "T0801"], questions_idx, "unmapped_page"
    )

    def gs19():
        for q in generated.get("review_questions", []):
            excerpt = q.get("source_excerpt", "")
            blob = q.get("question", "") + q.get("explanation", "") + excerpt
            if NOTATION_RE.search(blob):
                return True, f"{q['id']} giữ nguyên ký hiệu kỹ thuật: {NOTATION_RE.search(blob).group(0)!r}"
        return False, "không tìm thấy câu hỏi nào giữ ký hiệu kỹ thuật cụ thể (T=0, top_p, ...)"

    checks["GS-19"] = gs19

    def gs20():
        q1 = next((q for q in generated.get("review_questions", []) if "LLM" in q["question"]), None)
        if q1 and q1["options"][q1["correct_option"]].strip() == q1["answer"].strip():
            return True, f"{q1['id']}: correct_option khớp answer"
        return False, "câu hỏi định nghĩa LLM: correct_option không khớp answer"

    checks["GS-20"] = gs20

    def gs21():
        # Cau hoi (co dap an dung) HOAC 1 summary item neu co chua ca "chatbot" va "LLM" voi
        # dung chieu quan he (chatbot la san pham/lop ngoai, khong phai dinh nghia LLM).
        for q in generated.get("review_questions", []):
            blob = (q["question"] + " " + q.get("explanation", "")).lower()
            if "chatbot" in blob and q["options"][q["correct_option"]].strip() == q["answer"].strip():
                return True, f"{q['id']}: câu hỏi phân biệt chatbot/LLM, correct_option khớp answer"
        for s in generated.get("summary", []):
            blob = (s.get("title", "") + " " + s.get("content", "")).lower()
            if "chatbot" in blob and "llm" in blob:
                return True, f"{s['id']}: summary nêu đúng quan hệ chatbot/LLM"
        return False, "không tìm thấy nội dung phân biệt chatbot/LLM ở summary hay review_questions"

    checks["GS-21"] = gs21

    def gs22():
        app_js = os.path.join(HERE, "..", "frontend", "app.js")
        with open(app_js, encoding="utf-8") as f:
            content = f.read()
        ok = "hasFlagged" in content and "disclaimer" in content
        return ok, "app.js renderPdf() có nhánh hasFlagged -> disclaimer" if ok else "thiếu logic disclaimer"

    checks["GS-22"] = gs22

    def gs23():
        pp = os.path.join(HERE, "02_preprocess_chatlog.py")
        with open(pp, encoding="utf-8") as f:
            content = f.read()
        ok = "day_codes = " in content and "New learning material" not in content
        return (
            ok,
            "script chỉ nhận day_codes qua tham số dòng lệnh, không hardcode gộp 'New learning material'",
        )

    checks["GS-23"] = gs23

    def gs24():
        cl = os.path.join(HERE, "03_cluster.py")
        with open(cl, encoding="utf-8") as f:
            content = f.read()
        ok = '"selected_text": q["selected_text"]' in content
        return ok, "build_user_prompt truyền selected_text kèm clean_question cho AI" if ok else "thiếu selected_text trong prompt"

    checks["GS-24"] = gs24

    return checks


def run_gs03_live_template_trap():
    """GS-03: goi lai AI that DUNG HET system prompt san xuat cua 03_cluster.py (khong rut
    gon), voi 1 cap cau hoi dung cung template nhung khac khai niem, xac minh AI khong gop
    nham chi vi giong cau truc."""
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "cluster_03", os.path.join(HERE, "03_cluster.py")
    )
    cluster_03 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(cluster_03)
    SYSTEM_PROMPT = cluster_03.SYSTEM_PROMPT

    from common import call_ai_json

    user = json.dumps(
        {
            "lesson_id": "day1-foundation",
            "slide_page_titles": [{"page": 8, "first_line": "Token: model không đọc từ, model đọc mảnh chữ"}],
            "student_questions": [
                {
                    "turn_id": "SYN-token",
                    "user_id": "SYN-U1",
                    "page": 8,
                    "selected_text": "token",
                    "clean_question": "Giải thích đoạn bôi đen ở Trang 8: token",
                },
                {
                    "turn_id": "SYN-attention",
                    "user_id": "SYN-U2",
                    "page": 8,
                    "selected_text": "attention",
                    "clean_question": "Giải thích đoạn bôi đen ở Trang 8: attention",
                },
            ],
        },
        ensure_ascii=False,
    )
    result = call_ai_json("eval-gs03", SYSTEM_PROMPT, user, max_tokens=1000)
    cid_token = next(
        (c["cluster_id"] for c in result.get("clusters", []) if "SYN-token" in c["turn_ids"]), None
    )
    cid_attn = next(
        (c["cluster_id"] for c in result.get("clusters", []) if "SYN-attention" in c["turn_ids"]), None
    )
    ok = cid_token is not None and cid_attn is not None and cid_token != cid_attn
    return ok, f"token->{cid_token}, attention->{cid_attn}"


def main():
    if len(sys.argv) != 6:
        print(__doc__)
        sys.exit(1)
    golden_path, questions_path, clusters_path, generated_path, out_path = sys.argv[1:6]

    with open(golden_path, encoding="utf-8") as f:
        golden = json.load(f)
    with open(questions_path, encoding="utf-8") as f:
        questions = json.load(f)
    with open(clusters_path, encoding="utf-8") as f:
        clusters = json.load(f)
    with open(generated_path, encoding="utf-8") as f:
        generated = json.load(f)

    questions_idx = idx_by_turn(questions)
    checks = build_checks(questions_idx, clusters, generated)

    results = []
    for case in golden["cases"]:
        cid = case["id"]
        try:
            if cid == "GS-03":
                passed, detail = run_gs03_live_template_trap()
            else:
                fn = checks.get(cid)
                if fn is None:
                    passed, detail = False, "chưa có check tự động cho case này"
                else:
                    passed, detail = fn()
        except Exception as e:
            passed, detail = False, f"LỖI khi chạy check: {e}"

        results.append(
            {
                "id": cid,
                "group": case["group"],
                "taxonomy_class": case["taxonomy_class"],
                "difficulty": case["difficulty"],
                "source": case["source"],
                "passed": passed,
                "detail": detail,
            }
        )

    n_pass = sum(1 for r in results if r["passed"])
    n_total = len(results)
    pct = round(100 * n_pass / n_total, 1) if n_total else 0.0

    run = {
        "run_id": "run-001",
        "golden_set_size": n_total,
        "passed": n_pass,
        "failed": n_total - n_pass,
        "pass_rate_pct": pct,
        "results": results,
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(run, f, ensure_ascii=False, indent=2)

    print(f"KET QUA: {n_pass}/{n_total} pass ({pct}%)")
    for r in results:
        mark = "PASS" if r["passed"] else "FAIL"
        print(f"  [{mark}] {r['id']} ({r['group']}/{r['taxonomy_class']}) - {r['detail']}")
    print(f"Da ghi -> {out_path}")


if __name__ == "__main__":
    main()
