import frappe
import requests
import json
from bloomerang_erpnext.field_mapping import FIELD_MAPPING

@frappe.whitelist()
def get_field_mapping():
    """
    Returns the current field mapping configuration from Bloomerang Settings.
    """
    mappings = []
    try:
        for mapping in frappe.get_all("Bloomerang Field Mapping"):
            mappings.append(frappe.get_doc("Bloomerang Field Mapping", mapping.name))
    except Exception:
        pass
    return mappings

@frappe.whitelist()
def fetch_constituents(skip=0, take=20):
    """
    Fetches constituents from Bloomerang API.
    """
    try:
        # Fetch API Key from Bloomerang Settings doc
        api_key = None
        try:
            api_key = frappe.get_doc("Bloomerang Settings").get_password("api_key")
        except Exception:
            pass

        if not api_key:
            api_key = frappe.db.get_single_value("Bloomerang Settings", "api_key")

        if api_key:
            api_key = api_key.strip()

        if not api_key:
            return {"error": "Bloomerang API Key is missing. Please configure your API key in Bloomerang Settings."}

        url = f"https://api.bloomerang.co/v2/constituents?skip={skip}&take={take}"
        headers = {
            "X-API-KEY": api_key,
            "Accept": "application/json"
        }

        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            return response.json()
        elif response.status_code == 401:
            return {"error": "Bloomerang API Error: 401 Unauthorized - Invalid or expired API Key. Please verify your API key in Bloomerang Settings."}
        else:
            error_message = f"Bloomerang API Error: {response.status_code} - {response.text}"
            if response.text:
                error_message += f"\nResponse Body: {response.text}"
            return {"error": error_message}
    except Exception as e:
        return {"error": f"An unexpected error occurred: {str(e)}"}

@frappe.whitelist()
def sync_constituents(skip=0, take=50):
    """
    Fetches constituents from Bloomerang and syncs them into Bloomerang Constituent staging DocType.
    """
    try:
        # 1. Fetch from Bloomerang
        api_response = fetch_constituents(skip=skip, take=take)
        if "error" in api_response:
            return api_response

        constituents = api_response.get("data", [])
        if not constituents:
            return {"message": "No constituents found to sync.", "count": 0}

        # 2. Get Field Mappings
        mappings = []
        for m in frappe.get_all("Bloomerang Field Mapping", fields=["bloomerang_field", "erpnext_field", "target_doctype"]):
            mappings.append(m)

        if not mappings:
            return {"error": "No field mappings configured in Bloomerang Field Mapping."}

        synced_count = 0
        for b_const in constituents:
            b_id = b_const.get("id")
            if not b_id:
                continue

            # Check if already exists in staging
            if frappe.db.exists("Bloomerang Constituent", b_id):
                continue

            # Prepare staging doc
            staging_doc = frappe.get_doc({
                "doctype": "Bloomerang Constituent",
                "bloomerang_id": b_id,
                "raw_data": json.dumps(b_const)
            })

            # Map fields based on configuration
            for m in mappings:
                b_field = m.bloomerang_field
                e_field = m.erpnext_field
                
                if b_field in b_const:
                    staging_doc.set(e_field, b_const[b_field])

            staging_doc.insert(ignore_permissions=True)
            synced_count += 1

        return {"message": f"Successfully synced {synced_count} new constituents.", "count": synced_count}

    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Sync Constituents Error")
        return {"error": f"An unexpected error occurred during sync: {str(e)}"}



@frappe.whitelist()
def find_potential_matches(bloomerang_constituent_id):
    """
    Finds potential matches in ERPNext for a given Bloomerang constituent ID or query.
    """
    matches = []
    constituent = None

    # Check staging doctype first if exists
    try:
        if frappe.db.exists("Bloomerang Constituent", bloomerang_constituent_id):
            constituent = frappe.get_doc("Bloomerang Constituent", bloomerang_constituent_id)
    except Exception:
        pass

    email = constituent.email_id if constituent else (bloomerang_constituent_id if "@" in bloomerang_constituent_id else None)
    phone = constituent.phone if constituent else None
    name_query = constituent.full_name if constituent else bloomerang_constituent_id

    # 1. Exact Match by Email
    if email:
        erpnext_contacts = frappe.db.get_all("Contact", filters={"email_id": email}, fields=["name", "full_name", "email_id", "phone"])
        for erpnext_contact in erpnext_contacts:
            matches.append({
                "type": "Exact Match (Email)",
                "erpnext_id": erpnext_contact.name,
                "bloomerang_data": {
                    "full_name": constituent.full_name if constituent else bloomerang_constituent_id,
                    "email_id": email,
                    "phone": phone or "-"
                },
                "erpnext_data": erpnext_contact,
                "details": erpnext_contact
            })

    # 2. Match by Name / ID search
    if name_query:
        erpnext_contacts = frappe.db.get_all("Contact", filters=[["full_name", "like", f"%{name_query}%"]], fields=["name", "full_name", "email_id", "phone"], limit=10)
        existing_ids = {m["erpnext_id"] for m in matches}
        for erpnext_contact in erpnext_contacts:
            if erpnext_contact.name not in existing_ids:
                matches.append({
                    "type": "Name Match",
                    "erpnext_id": erpnext_contact.name,
                    "bloomerang_data": {
                        "full_name": constituent.full_name if constituent else name_query,
                        "email_id": email or "-",
                        "phone": phone or "-"
                    },
                    "erpnext_data": erpnext_contact,
                    "details": erpnext_contact
                })

    return {
        "matches": matches
    }


@frappe.whitelist()
def dry_run_match(bloomerang_constituent_id):
    """
    Performs a dry run of the matching engine.
    It finds potential matches and, for each match, calculates the proposed field updates
    based on the field mapping, without actually saving anything to the database.
    """
    from bloomerang_erpnext.field_mapping import match_record

    matches_result = find_potential_matches(bloomerang_constituent_id)
    matches = matches_result.get("matches", [])

    if not matches:
        return {"message": "No matches found for dry run.", "matches": []}

    # Get the constituent record to have the source data
    constituent = None
    try:
        if frappe.db.exists("Bloomerang Constituent", bloomerang_constituent_id):
            constituent = frappe.get_doc("Bloomerang Constituent", bloomerang_constituent_id)
    except Exception:
        pass

    if not constituent:
        return {"error": "Could not find Bloomerang Constituent record for dry run."}

    # Parse the raw data to get the actual Bloomerang record dictionary
    try:
        bloomerang_record = json.loads(constituent.raw_data)
    except Exception:
        return {"error": "Could not parse raw data from Bloomerang Constituent."}

    # Identify which fields should be updated based on the mapping
    # match_record returns a list of target field names that have a source match
    target_fields = match_record(bloomerang_record)

    dry_run_matches = []
    for match in matches:
        erpnext_id = match["erpnext_id"]
        erpnext_data = match["erpnext_data"]

        proposed_updates = {}
        for field in target_fields:
            # Find the source field name for this target field
            # We need to reverse lookup the mapping: target -> source
            mapping = FIELD_MAPPING["bloomerang_to_erpnext"]
            source_field = None
            for src, tgt in mapping.items():
                if tgt == field:
                    source_field = src
                    break

            if source_field and source_field in bloomerang_record:
                val = bloomerang_record[source_field]
                # If it's a dict (like email/phone), we might need more specific handling,
                # but for this dry run, we'll just take the value if it's simple.
                # In a real scenario, we'd handle the nested structure.
                if not isinstance(val, dict):
                    proposed_updates[field] = val
                else:
                    # Basic attempt to handle common nested structures seen in Bloomerang
                    # This is a simplified approach for the dry run.
                    if field == "email_id" and "PrimaryEmail" in bloomerang_record:
                        proposed_updates[field] = bloomerang_record["PrimaryEmail"].get("Value")
                    elif field == "phone" and "PrimaryPhone" in bloomerang_record:
                        proposed_updates[field] = bloomerang_record["PrimaryPhone"].get("Number")

        dry_run_matches.append({
            "erpnext_id": erpnext_id,
            "type": match["type"],
            "proposed_updates": proposed_updates
        })

    return {
        "message": "Dry run completed successfully.",
        "matches": dry_run_matches
    }

@frappe.whitelist()
def execute_merge(erpnext_id, updated_values):
    """
    Executes the merge by updating the ERPNext record with the provided values.
    """
    try:
        doc = frappe.get_doc("Contact", erpnext_id)
        
        for field, value in updated_values.items():
            if hasattr(doc, field) and value != "-":
                setattr(doc, field, value)
        
        doc.save()
        frappe.db.commit()
        
        return {"status": "success", "message": f"Successfully merged record {erpnext_id}"}
    except Exception as e:
        return {"error": f"Merge failed: {str(e)}"}

@frappe.whitelist()
def stage_constituents(skip=0, take=100):
    """
    Fetches constituents from Bloomerang and stages them in the Bloomerang Constituent DocType.
    """
    data = fetch_constituents(skip=skip, take=take)
    if data.get("error"):
        return data
    
    results = data.get("Results", [])
    if not results:
        return {"message": "No constituents found to stage."}

    created_count = 0
    updated_count = 0

    for item in results:
        bloomerang_id = item.get("Id")
        if not bloomerang_id:
            continue

        existing = frappe.db.get_value("Bloomerang Constituent", {"bloomerang_id": bloomerang_id}, "name", as_dict=True)
        doc = frappe.get_doc("Bloomerang Constituent", existing["name"]) if existing else frappe.new_doc("Bloomerang Constituent")
        
        doc.bloomerang_id = bloomerang_id
        doc.first_name = item.get("FirstName")
        doc.last_name = item.get("LastName")
        doc.full_name = item.get("FullName")
        doc.email_id = item.get("PrimaryEmail", {}).get("Value")
        doc.phone = item.get("PrimaryPhone", {}).get("Number")
        doc.type = item.get("Type")
        doc.status = item.get("Status")
        doc.raw_data = json.dumps(item)

        if existing:
            doc.save()
            updated_count += 1
        else:
            doc.insert()
            created_count += 1

    return {
        "message": f"Successfully staged {len(results)} constituents. ({created_count} created, {updated_count} updated)."
    }
