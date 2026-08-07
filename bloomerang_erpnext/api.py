import frappe
import requests
import json
from bloomerang_erpnext.field_mapping import FIELD_MAPPING

@frappe.whitelist()
def get_field_mapping():
    """
    Returns the current field mapping configuration.
    """
    return FIELD_MAPPING

@frappe.whitelist()
def fetch_constituents(skip=0, take=20):
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
        # Catch any unexpected exceptions and return them as a structured error
        return {"error": f"An unexpected error occurred: {str(e)}"}

@frappe.whitelist()
def find_potential_matches(bloomerang_constituent_id):
    """
    Finds potential matches in ERPNext for a given Bloomerang constituent.
    """
    # 1. Fetch the Bloomerang constituent from staging
    constituent = frappe.get_doc("Bloomerang Constituent", bloomerang_constituent_id)
    
    matches = []

    # 2. Exact Match by Email
    if constituent.email_id:
        erpnext_contact = frappe.db.get_value("Contact", {"email_id": constituent.email_id}, ["name", "full_name", "email_id", "phone"], as_dict=True)
        if erpnext_contact:
            matches.append({
                "type": "Exact Match (Email)",
                "erpnext_id": erpnext_contact.name,
                "bloomerang_data": {
                    "full_name": constituent.full_name,
                    "email_id": constituent.email_id,
                    "phone": constituent.phone
                },
                "erpnext_data": erpnext_contact
            })

    # 3. Exact Match by Phone
    if constituent.phone:
        erpnext_contact = frappe.db.get_value("Contact", {"phone": constituent.phone}, ["name", "full_name", "email_id", "phone"], as_dict=True)
        if erpnext_contact:
            matches.append({
                "type": "Exact Match (Phone)",
                "erpnext_id": erpnext_contact.name,
                "bloomerang_data": {
                    "full_name": constituent.full_name,
                    "email_id": constituent.email_id,
                    "phone": constituent.phone
                },
                "erpnext_data": erpnext_contact
            })

    # 4. Placeholder for Fuzzy LLM Match
    # In a real implementation, this would call an LLM service to compare names
    # matches.extend(perform_llm_fuzzy_match(constituent))

    return {
        "matches": matches
    }

@frappe.whitelist()
def execute_merge(erpnext_id, updated_values):
    """
    Executes the merge by updating the ERPNext record with the provided values.
    """
    try:
        doc = frappe.get_doc("Contact", erpnext_id)
        
        for field, value in updated_values.items():
            if hasattr(doc, field):
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
    # 1. Fetch from Bloomerang
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

        # Check if exists
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
