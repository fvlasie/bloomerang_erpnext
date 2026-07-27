import frappe
import requests

@frappe.whitelist()
def fetch_constituents(skip=0, take=20):
    # Fetch API Key from Bloomerang Settings doc
    api_key = frappe.db.get_single_value("Bloomerang Settings", "api_key")
    
    if not api_key:
        frappe.throw("Bloomerang API Key is missing in Bloomerang Settings.")

    url = f"https://api.bloomerang.co/v2/constituents?skip={skip}&take={take}"
    headers = {
        "X-API-KEY": api_key,
        "Accept": "application/json"
    }

    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        return response.json()
    else:
        frappe.throw(f"Bloomerang API Error: {response.status_code} - {response.text}")