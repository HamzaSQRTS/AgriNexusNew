import requests
import json
import time
import os

BASE_URL = "http://localhost:8000/api/v1"

def authenticate(email, password, role="farmer"):
    # Try to register first, ignore if exists
    requests.post(f"{BASE_URL}/auth/register", json={
        "email": email,
        "password": password,
        "full_name": f"Test {role}",
        "role": role
    })
    
    # Login
    response = requests.post(f"{BASE_URL}/auth/login", data={
        "username": email,
        "password": password
    })
    if response.status_code == 200:
        return response.json().get("access_token")
    else:
        print(f"Failed to login {email}:", response.text)
        return None

def upload_image(token, file_path):
    print(f"\n--- 1 & 2. Uploading {file_path} and Reading Text (OCR) ---")
    headers = {"Authorization": f"Bearer {token}"}
    if not os.path.exists(file_path):
        print(f"File {file_path} not found.")
        return None
        
    with open(file_path, "rb") as f:
        files = {"file": (os.path.basename(file_path), f, "image/jpeg")}
        response = requests.post(f"{BASE_URL}/upload/file", headers=headers, files=files)
        
    if response.status_code == 200:
        res_json = response.json()
        print("Upload Successful!")
        print("Extracted Metadata & Pipeline Status:")
        print(json.dumps(res_json, indent=2))
        return res_json
    else:
        print("Upload Failed:", response.text)
        return None

def generate_report(token):
    print("\n--- 3. Passing through Report Engine ---")
    headers = {"Authorization": f"Bearer {token}"}
    payload = {
        "categories": ["crop_health_pest", "soil_health_nutrient"],
        "farm": {
            "latitude": 31.5204,
            "longitude": 74.3587,
            "crop": "wheat",
            "acreage_hectares": 10.0,
            "growth_stage": "flowering"
        },
        "chat_hints": ["The leaves have some brown spots", "Soil feels a bit dry"]
    }
    
    response = requests.post(f"{BASE_URL}/reports/engine/generate", headers=headers, json=payload)
    if response.status_code == 200:
        res_json = response.json()
        print("Report Generated Successfully!")
        print(json.dumps(res_json, indent=2))
        return res_json
    else:
        print("Report Generation Failed:", response.text)
        return None

def get_analytics(token):
    print("\n--- 4. Generating Analytics (Admin) ---")
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get(f"{BASE_URL}/analytics/system", headers=headers)
    
    if response.status_code == 200:
        res_json = response.json()
        print("Analytics Retrieved Successfully!")
        print(json.dumps(res_json, indent=2))
        return res_json
    else:
        print("Analytics Retrieval Failed:", response.text)
        return None

def run_workflow():
    print("Waiting for backend to be fully ready...")
    time.sleep(2)  # Give some time if server just started
    
    # 1. Authenticate as farmer
    farmer_token = authenticate("farmer_workflow_final@example.com", "password123", "farmer")
    if not farmer_token:
        return
        
    # 2. Authenticate as admin for analytics
    admin_token = authenticate("admin_workflow_final@example.com", "password123", "admin")
    
    # Run the flow
    image_path = "594285.jpg"
    upload_image(farmer_token, image_path)
    
    generate_report(farmer_token)
    
    if admin_token:
        get_analytics(admin_token)

if __name__ == "__main__":
    run_workflow()
