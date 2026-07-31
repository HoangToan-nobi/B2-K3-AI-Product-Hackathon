#!/usr/bin/env python3
"""Ghep ket qua tung buoc pipeline thanh 1 file dung schema review-pack.json.

Dung: python3 05_build_pack.py <lesson_id> <lesson_title> <slide_count> \
  <questions.json> <clusters.json> <generated.json> <output.json>
"""
import datetime
import json
import sys


def main():
    if len(sys.argv) != 8:
        print(__doc__)
        sys.exit(1)
    lesson_id, lesson_title, slide_count_s = sys.argv[1:4]
    questions_path, clusters_path, generated_path, out_path = sys.argv[4:8]
    slide_count = int(slide_count_s)

    with open(questions_path, encoding="utf-8") as f:
        questions = json.load(f)
    with open(clusters_path, encoding="utf-8") as f:
        clusters = json.load(f)
    with open(generated_path, encoding="utf-8") as f:
        generated = json.load(f)

    total_student_msgs = len(questions)
    noise_count = sum(1 for q in questions if q["is_noise"])
    unique_users = len({q["user_id"] for q in questions if not q["is_noise"]})

    n_clusters = len(clusters.get("clusters", []))
    skipped_ids = {c["cluster_id"] for c in generated.get("skipped_clusters", [])}
    n_included = n_clusters - len(skipped_ids)

    has_flagged = any(
        item["status"] == "needs_review"
        for group in ("summary", "class_insights", "review_questions")
        for item in generated.get(group, [])
    )

    pack = {
        "schema_version": "1.0",
        "pack_id": f"pack-{lesson_id}-001",
        "status": "needs_review" if has_flagged else "ready",
        "lesson": {
            "id": lesson_id,
            "title": lesson_title,
            "slide_count": slide_count,
        },
        "analysis": {
            "student_question_count": total_student_msgs,
            "unique_user_count": unique_users,
            "cluster_count": n_clusters,
            "included_cluster_count": n_included,
            "excluded_noise_count": noise_count + len(clusters.get("excluded", [])),
        },
        "summary": generated.get("summary", []),
        "class_insights": generated.get("class_insights", []),
        "review_questions": generated.get("review_questions", []),
        "warnings": generated.get("warnings", []),
        "generated_at": datetime.datetime.now(datetime.timezone.utc)
        .isoformat()
        .replace("+00:00", "Z"),
    }

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(pack, f, ensure_ascii=False, indent=2)

    print(f"Da ghep pack: {n_included}/{n_clusters} cluster dua vao PDF, status={pack['status']}")
    print(f"Da ghi -> {out_path}")


if __name__ == "__main__":
    main()
