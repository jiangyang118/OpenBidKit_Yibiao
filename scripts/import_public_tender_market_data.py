#!/usr/bin/env python3
"""Import the local YiFangBao bid analysis dataset into YiBiao's market tables."""

from __future__ import annotations

import argparse
import ast
import csv
import hashlib
import html
import json
import math
import os
import re
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_SOURCE_ROOT = Path("/Users/jack/code/010-cpt/008-zhct/bid-analysis-methodology")
DEFAULT_CSV_PATH = DEFAULT_SOURCE_ROOT / "data/processed/20260612-yifangbao/cleaned_awards.csv"
DEFAULT_DB_PATH = Path.home() / "Library/Application Support/yibiao-client/workspace/yibiao.sqlite"
SOURCE_ID = "bid_analysis_methodology_yifangbao_20260612"
LEGACY_SOURCE_IDS = [
    "bid_analysis_methodolgy_20241004",
    "public_tender_analysis_dashboard_20241004",
]

SOFTWARE_KEYWORDS = [
    "software",
    "system",
    "solution",
    "platform",
    "license",
    "licence",
    "database",
    "application",
    "portal",
    "cyber",
    "digital",
    "payroll",
    "attendance",
    "information",
    "软件",
    "系统",
    "平台",
    "监管",
    "结算",
    "支付",
    "订餐",
    "报表",
    "数据",
    "智慧食堂",
]

HARDWARE_KEYWORDS = [
    "equipment",
    "appliance",
    "parts",
    "mower",
    "vehicle",
    "truck",
    "server",
    "computer",
    "camera",
    "printer",
    "pump",
    "generator",
    "hvac",
    "furniture",
    "material",
    "materials",
    "supplies",
    "硬件",
    "设备",
    "终端",
    "刷脸",
    "消费机",
    "摄像",
    "闸机",
    "服务器",
    "餐台",
    "称重",
]

SUPPORTING_KEYWORDS = [
    "install",
    "installation",
    "maintenance",
    "support",
    "training",
    "warranty",
    "delivery",
    "repair",
    "service",
    "implementation",
    "consulting",
    "安装",
    "实施",
    "维保",
    "运维",
    "培训",
    "服务",
    "集成",
]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_mapping_file(path: Path, variable_name: str) -> dict[str, str]:
    if not path.exists():
        return {}
    mapping: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(variable_name) or stripped in {"{", "}"}:
            continue
        if ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        mapping[key.strip().strip('"')] = value.strip().rstrip(",").strip('"')
    return mapping


def parse_cluster_file(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8")
    match = re.search(r"clusters\s*=\s*(\{.*\})\s*$", text, re.S)
    if not match:
        return {}
    clusters = ast.literal_eval(match.group(1))
    entity_to_cluster: dict[str, str] = {}
    for cluster_name, entities in clusters.items():
        for entity in entities:
            entity_to_cluster[str(entity).strip()] = str(cluster_name).strip()
    return entity_to_cluster


def parse_date(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass
    return value


def parse_amount(value: str) -> float | None:
    text = (value or "").replace(",", "").strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_bool(value: str) -> bool:
    return (value or "").strip().lower() == "true"


def parse_duration_days(value: str) -> int | None:
    text = (value or "").strip()
    if not text:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def iso_duration_days(start_date: str, close_date: str) -> int | None:
    if not start_date or not close_date:
        return None
    try:
        start = datetime.strptime(start_date, "%Y-%m-%d").date()
        close = datetime.strptime(close_date, "%Y-%m-%d").date()
        return (close - start).days
    except ValueError:
        return None


def stable_id(*parts: Any) -> str:
    raw = "\u241f".join(str(part) for part in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:24]


def clean_text(value: str) -> str:
    return html.unescape(value or "").strip()


def compact_name(text: str, fallback: str) -> str:
    normalized = re.sub(r"\s+", " ", clean_text(text))
    if not normalized:
        return fallback
    return normalized[:160]


def demand_type(raw: dict[str, str]) -> str:
    return compact_name(raw.get("需求类型") or "", "未标注")


def customer_type(raw: dict[str, str]) -> str:
    return compact_name(raw.get("客户类型") or "", "未识别")


def extract_specs(description: str) -> dict[str, list[str]]:
    text = clean_text(description)
    lower = text.lower()
    software = [kw for kw in SOFTWARE_KEYWORDS if kw in lower]
    hardware = [kw for kw in HARDWARE_KEYWORDS if kw in lower]
    supporting = [kw for kw in SUPPORTING_KEYWORDS if kw in lower]
    model_tokens = sorted(set(re.findall(r"\b[A-Z]{2,}[-/]?\d{2,}[A-Z0-9-]*\b|\b\d+(?:\.\d+)?\s?(?:hp|kw|kv|cm|mm|in|inch|ft|ton|gb|tb)\b", text, re.I)))
    quantity_tokens = sorted(set(re.findall(r"\b\d+\s?(?:units?|pcs?|pieces?|sets?|vehicles?|trucks?|mowers?|servers?|licenses?)\b", text, re.I)))
    return {
        "software": software,
        "hardware": hardware,
        "models": model_tokens[:20],
        "supporting": sorted(set(supporting + quantity_tokens))[:30],
    }


def risk_flags(row: dict[str, Any], duplicate_count: int, p95_amount: float) -> list[dict[str, str]]:
    flags: list[dict[str, str]] = []
    vendor = (row["supplier_name"] or "").strip()
    description = (row["project_name"] or "").strip()
    amount = row["amount"]
    duration = row["duration_days"]
    if not vendor:
        flags.append({"level": "high", "rule": "missing_supplier", "reason": "原始数据未提供中标供应商。"})
    if not row["buyer_contact_available"]:
        flags.append({"level": "medium", "rule": "missing_buyer_contact", "reason": "原始数据未提供可用招标单位联系人或联系电话。"})
    if vendor and not row["supplier_contact_available"]:
        flags.append({"level": "info", "rule": "missing_supplier_contact", "reason": "原始数据未提供可用中标单位联系人或联系电话。"})
    if not description:
        flags.append({"level": "medium", "rule": "missing_description", "reason": "原始数据未提供招标描述。"})
    if amount is None:
        flags.append({"level": "medium", "rule": "missing_amount", "reason": "原始数据未提供可计算的中标金额。"})
    elif amount <= 0:
        flags.append({"level": "high", "rule": "invalid_amount", "reason": "中标金额小于等于 0，需要人工复核。"})
    if amount is not None and p95_amount and amount >= p95_amount:
        flags.append({"level": "info", "rule": "large_award", "reason": f"中标金额达到本数据集前 5% 阈值：{p95_amount:,.2f}。"})
    if duration is not None and duration < 0:
        flags.append({"level": "high", "rule": "invalid_duration", "reason": "合同工期小于 0。"})
    if duplicate_count > 1:
        flags.append({"level": "info", "rule": "duplicate_project_no", "reason": f"同一项目编号在源数据中出现 {duplicate_count} 次，需确认是否多包或重复公告。"})
    return flags


def score_record(row: dict[str, Any], buyer_count: int, supplier_count: int, max_buyer_count: int, amount_p95: float) -> dict[str, Any]:
    amount = row["amount"] or 0
    amount_attractiveness = 0 if amount <= 0 else min(100, 100 * math.log10(amount + 1) / math.log10(max(amount_p95, amount, 10) + 1))
    market_heat = min(100, 100 * math.log1p(buyer_count) / math.log1p(max(max_buyer_count, 1)))
    customer_value = 70 if row["customer_type"] in {"银行", "学校", "医院", "国企", "政府/事业单位", "园区/产业平台"} else 50
    if amount >= amount_p95 and amount_p95:
        customer_value = min(100, customer_value + 20)
    competition_accessibility = 45 if not row["supplier_name"] else 65
    if supplier_count <= 2:
        competition_accessibility += 10
    actionability = 75 if row["project_name"] and row["demand_type"] != "未标注" else 45
    total = (
        market_heat * 0.2
        + amount_attractiveness * 0.25
        + customer_value * 0.2
        + competition_accessibility * 0.15
        + actionability * 0.2
    )
    return {
        "total_score": round(total, 2),
        "market_heat": round(market_heat, 2),
        "amount_attractiveness": round(amount_attractiveness, 2),
        "customer_value": round(customer_value, 2),
        "competition_accessibility": round(min(100, competition_accessibility), 2),
        "actionability": round(actionability, 2),
    }


def percentile(values: list[float], ratio: float) -> float:
    if not values:
        return 0
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round((len(ordered) - 1) * ratio)))
    return ordered[index]


def load_rows(csv_path: Path, source_root: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        reader = csv.DictReader(handle)
        for line_number, raw in enumerate(reader, start=2):
            project_no = clean_text(raw.get("项目编号") or "")
            project_name = clean_text(raw.get("项目名称") or "")
            buyer = clean_text(raw.get("招标单位") or "")
            supplier = clean_text(raw.get("中标单位") or "")
            publish_date = parse_date(raw.get("发布时间") or raw.get("信息发布时间") or "")
            contract_start_date = parse_date(raw.get("合同开始时间") or "")
            contract_end_date = parse_date(raw.get("合同结束时间") or "")
            amount = parse_amount(raw.get("金额数值") or raw.get("中标金额（元）") or "")
            duration_days = parse_duration_days(raw.get("合同工期天数") or raw.get("合同工期") or "")
            current_demand_type = demand_type(raw)
            current_customer_type = customer_type(raw)
            row = {
                "line_number": line_number,
                "project_no": project_no,
                "record_id": f"bam_{stable_id(SOURCE_ID, line_number, project_no, project_name, buyer, supplier)}",
                "project_name": compact_name(project_name, project_no or f"第 {line_number} 行招投标记录"),
                "publish_date": publish_date,
                "contract_start_date": contract_start_date,
                "contract_end_date": contract_end_date,
                "amount": amount,
                "buyer_name": buyer,
                "supplier_name": supplier,
                "demand_type": current_demand_type,
                "customer_type": current_customer_type,
                "product_summary": project_name,
                "duration_days": duration_days,
                "source_url": clean_text(raw.get("官网查看地址") or ""),
                "province": clean_text(raw.get("发布省份") or ""),
                "city": clean_text(raw.get("发布市级") or ""),
                "district": clean_text(raw.get("发布区级") or ""),
                "stage": clean_text(raw.get("中标阶段") or "中标通知"),
                "buyer_contact_available": parse_bool(raw.get("招标联系人可用") or ""),
                "supplier_contact_available": parse_bool(raw.get("中标联系人可用") or ""),
                "raw": raw,
                "normalized": {
                    "buyer_name": buyer,
                    "supplier_name": supplier,
                    "project_no": project_no,
                    "demand_type": current_demand_type,
                    "customer_type": current_customer_type,
                    "publish_date": publish_date,
                    "contract_start_date": contract_start_date,
                    "contract_end_date": contract_end_date,
                    "duration_days": duration_days,
                    "amount_yuan": amount,
                },
            }
            row["product_extraction"] = extract_specs(project_name)
            rows.append(row)
    return rows


def import_rows(db_path: Path, csv_path: Path, source_root: Path, replace: bool) -> dict[str, Any]:
    rows = load_rows(csv_path, source_root)
    amounts = [row["amount"] for row in rows if row["amount"] is not None and row["amount"] > 0]
    p95_amount = percentile(amounts, 0.95)
    buyer_counts = Counter(row["buyer_name"] for row in rows)
    supplier_counts = Counter(row["supplier_name"] for row in rows)
    project_no_counts = Counter(row["project_no"] for row in rows if row["project_no"])
    max_buyer_count = max(buyer_counts.values() or [1])
    now = utc_now()

    connection = sqlite3.connect(str(db_path))
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        with connection:
            if replace:
                connection.execute("DELETE FROM bid_market_opportunity_scores")
                connection.execute("DELETE FROM bid_market_risk_flags")
                connection.execute("DELETE FROM bid_market_products")
                connection.execute("DELETE FROM bid_market_company_qualifications")
                connection.execute("DELETE FROM bid_market_records")
                connection.execute("DELETE FROM bid_market_sources")

            connection.execute(
                """
                INSERT INTO bid_market_sources (
                  source_id, source_type, source_name, source_url, local_path,
                  reference_project, imported_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source_id) DO UPDATE SET
                  source_type=excluded.source_type,
                  source_name=excluded.source_name,
                  source_url=excluded.source_url,
                  local_path=excluded.local_path,
                  reference_project=excluded.reference_project,
                  imported_at=excluded.imported_at,
                  updated_at=excluded.updated_at
                """,
                (
                    SOURCE_ID,
                    "local_csv",
                    "Bid Analysis Methodology - 2026 H1 YiFangBao Smart Canteen Awards",
                    "https://codeup.aliyun.com/60069db88deaa14d9e02b875/zhct/bid-analysis-methodology.git",
                    str(csv_path),
                    "bid-analysis-methodology",
                    now,
                    now,
                    now,
                ),
            )

            record_sql = """
              INSERT INTO bid_market_records (
                record_id, source_id, project_name, publish_date, province, city, district,
                stage, amount, buyer_name, supplier_name, demand_type, customer_type,
                product_summary, raw_json, source_url, linked_opportunity_id,
                linked_knowledge_document_id, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
              ON CONFLICT(record_id) DO UPDATE SET
                project_name=excluded.project_name,
                publish_date=excluded.publish_date,
                amount=excluded.amount,
                buyer_name=excluded.buyer_name,
                supplier_name=excluded.supplier_name,
                demand_type=excluded.demand_type,
                customer_type=excluded.customer_type,
                product_summary=excluded.product_summary,
                raw_json=excluded.raw_json,
                updated_at=excluded.updated_at
            """
            product_sql = """
              INSERT INTO bid_market_products (
                product_id, record_id, name, category, software_features_json,
                hardware_specs_json, model_specs_json, supporting_items_json,
                evidence, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(product_id) DO UPDATE SET
                name=excluded.name,
                category=excluded.category,
                software_features_json=excluded.software_features_json,
                hardware_specs_json=excluded.hardware_specs_json,
                model_specs_json=excluded.model_specs_json,
                supporting_items_json=excluded.supporting_items_json,
                evidence=excluded.evidence,
                updated_at=excluded.updated_at
            """
            risk_sql = """
              INSERT INTO bid_market_risk_flags (
                flag_id, record_id, level, rule, reason, review_status, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
              ON CONFLICT(flag_id) DO UPDATE SET
                level=excluded.level,
                rule=excluded.rule,
                reason=excluded.reason,
                updated_at=excluded.updated_at
            """
            score_sql = """
              INSERT INTO bid_market_opportunity_scores (
                score_id, record_id, total_score, market_heat, amount_attractiveness,
                customer_value, competition_accessibility, actionability, scoring_json,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(score_id) DO UPDATE SET
                total_score=excluded.total_score,
                market_heat=excluded.market_heat,
                amount_attractiveness=excluded.amount_attractiveness,
                customer_value=excluded.customer_value,
                competition_accessibility=excluded.competition_accessibility,
                actionability=excluded.actionability,
                scoring_json=excluded.scoring_json,
                updated_at=excluded.updated_at
            """

            inserted_flags = 0
            for row in rows:
                duplicate_count = project_no_counts[row["project_no"]] if row["project_no"] else 1
                flags = risk_flags(row, duplicate_count, p95_amount)
                score = score_record(
                    row,
                    buyer_counts[row["buyer_name"]],
                    supplier_counts[row["supplier_name"]],
                    max_buyer_count,
                    p95_amount,
                )
                raw_json = {
                    "source_dataset": str(csv_path),
                    "source_row_number": row["line_number"],
                    "source_record_id": row["project_no"],
                    "raw": row["raw"],
                    "normalized": row["normalized"],
                    "derived": {
                        "duration_days": row["duration_days"],
                        "amount_p95": p95_amount,
                        "buyer_record_count": buyer_counts[row["buyer_name"]],
                        "supplier_record_count": supplier_counts[row["supplier_name"]],
                        "project_no_record_count": duplicate_count,
                    },
                    "product_extraction": row["product_extraction"],
                    "risk_flags": flags,
                    "opportunity_score": score,
                }
                connection.execute(
                    record_sql,
                    (
                        row["record_id"],
                        SOURCE_ID,
                        row["project_name"],
                        row["publish_date"],
                        row["province"],
                        row["city"],
                        row["district"],
                        row["stage"],
                        row["amount"],
                        row["buyer_name"],
                        row["supplier_name"],
                        row["demand_type"],
                        row["customer_type"],
                        row["product_summary"],
                        json.dumps(raw_json, ensure_ascii=False, separators=(",", ":")),
                        row["source_url"],
                        now,
                        now,
                    ),
                )
                extraction = row["product_extraction"]
                connection.execute(
                    product_sql,
                    (
                        f"ptad_product_{stable_id(row['record_id'])}",
                        row["record_id"],
                        row["project_name"],
                        row["demand_type"],
                        json.dumps(extraction["software"], ensure_ascii=False),
                        json.dumps(extraction["hardware"], ensure_ascii=False),
                        json.dumps(extraction["models"], ensure_ascii=False),
                        json.dumps(extraction["supporting"], ensure_ascii=False),
                        row["product_summary"],
                        now,
                        now,
                    ),
                )
                for flag in flags:
                    inserted_flags += 1
                    connection.execute(
                        risk_sql,
                        (
                            f"ptad_flag_{stable_id(row['record_id'], flag['rule'])}",
                            row["record_id"],
                            flag["level"],
                            flag["rule"],
                            flag["reason"],
                            now,
                            now,
                        ),
                    )
                connection.execute(
                    score_sql,
                    (
                        f"ptad_score_{stable_id(row['record_id'])}",
                        row["record_id"],
                        score["total_score"],
                        score["market_heat"],
                        score["amount_attractiveness"],
                        score["customer_value"],
                        score["competition_accessibility"],
                        score["actionability"],
                        json.dumps(
                            {
                                **score,
                                "method": "weighted heuristic v1",
                                "weights": {
                                    "market_heat": 0.2,
                                    "amount_attractiveness": 0.25,
                                    "customer_value": 0.2,
                                    "competition_accessibility": 0.15,
                                    "actionability": 0.2,
                                },
                            },
                            ensure_ascii=False,
                            separators=(",", ":"),
                        ),
                        now,
                        now,
                    ),
                )

    finally:
        connection.close()

    return {
        "source_id": SOURCE_ID,
        "csv_path": str(csv_path),
        "db_path": str(db_path),
        "records": len(rows),
        "products": len(rows),
        "risk_flags": inserted_flags,
        "scores": len(rows),
        "buyers": len(buyer_counts),
        "suppliers": len(supplier_counts),
        "amount_p95": p95_amount,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV_PATH)
    parser.add_argument("--source-root", type=Path, default=DEFAULT_SOURCE_ROOT)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--append", action="store_true", help="Do not delete prior rows from the same source before importing.")
    args = parser.parse_args()

    if not args.csv.exists():
        raise SystemExit(f"CSV not found: {args.csv}")
    if not args.db.exists():
        raise SystemExit(f"YiBiao database not found: {args.db}")

    result = import_rows(args.db, args.csv, args.source_root, replace=not args.append)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
