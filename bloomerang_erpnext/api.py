import frappe
import requests

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