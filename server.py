#!/usr/bin/env python3
"""
GreenMaster AI - Lawn Care Local Server
Serves the Lawn App PWA locally and provides an optional API bridge for Gemini Vision.
"""
import os
import sys
import json
import urllib.request
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class LawnAppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_POST(self):
        if self.path == '/api/analyze-lawn':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                gemini_api_key = payload.get('apiKey') or os.environ.get('GEMINI_API_KEY')
                image_base64 = payload.get('imageBase64')
                lawn_profile = payload.get('profile', {})

                # If an API key is provided, proxy request to Gemini 1.5 Flash Vision
                if gemini_api_key and image_base64:
                    response_data = self.call_gemini_vision(gemini_api_key, image_base64, lawn_profile)
                    self.send_json_response(200, response_data)
                else:
                    # Return signal to let client-side Agronomy AI Engine process it
                    self.send_json_response(200, {
                        "mode": "client_engine",
                        "message": "Processed via Agronomy Vision Model"
                    })
            except Exception as e:
                self.send_json_response(500, {"error": str(e)})
        else:
            self.send_error(404, "Endpoint not found")

    def call_gemini_vision(self, api_key, image_base64, profile):
        # Clean base64 string if it contains data prefix
        mime_type = "image/jpeg"
        if "," in image_base64:
            header, image_base64 = image_base64.split(",", 1)
            if "png" in header:
                mime_type = "image/png"
            elif "webp" in header:
                mime_type = "image/webp"

        prompt = f"""
You are the world's leading turfgrass agronomist and master greenkeeper.
Analyze this photo of a lawn. The lawn owner's profile is:
- Grass Type: {profile.get('grassType', 'Unknown')}
- Approach Tier: {profile.get('tier', 'Semi-Professional')} (Low / Semi-Professional / Full Professional Golf/Bowling Green)
- Current Height of Cut (HOC): {profile.get('hoc', '20')} mm
- Equipment Owned: {', '.join(profile.get('equipment', ['Rotary Mower']))}
- Irrigation / Sprinkler: {profile.get('sprinklers', 'Manual Hose')} - {profile.get('wateringFreq', '2 times/week')}
- Herbicides Owned: {', '.join(profile.get('herbicides', []))}
- Fertilisers Owned: {', '.join(profile.get('fertilisers', []))}

Return ONLY a valid JSON object matching this exact schema:
{{
  "healthScore": 85,
  "darkGreenColorIndex": 78,
  "densityScore": 80,
  "weedPressure": "Low",
  "weedsDetected": ["Clover", "Crabgrass"],
  "diseaseOrStress": "Slight drought stress on edges, no fungal lesions detected",
  "scalpOrBladeCondition": "Clean cut, sharp reel blades evident",
  "overallVerdict": "Lawn is thriving with dense stolon growth. Ready for light spoon-feed and height maintenance.",
  "recommendedHOC": 15,
  "actionPlan": {{
    "oneWeek": [
      {{"task": "Mow at 15mm with reel mower", "urgency": "High", "category": "Mowing", "tip": "Mow twice this week to promote tillering"}},
      {{"task": "Deep watering cycle (15mm)", "urgency": "Medium", "category": "Watering", "tip": "Water at 5:30 AM before the sun heats up"}}
    ],
    "twoWeeks": [
      {{"task": "Foliar spoon feed with high Nitrogen & Iron", "urgency": "Medium", "category": "Fertiliser", "tip": "Apply at 0.1 lb N / 1000 sq ft"}},
      {{"task": "Selective herbicide spot spray", "urgency": "Low", "category": "Weed Control", "tip": "Spot spray visible broadleaf weeds during cool morning"}}
    ],
    "oneMonth": [
      {{"task": "Apply wetting agent / soil surfactant", "urgency": "High", "category": "Soil", "tip": "Improves water penetration and prevents dry patch"}},
      {{"task": "Check soil compaction and light aeration", "urgency": "Medium", "category": "Renovation", "tip": "Solid tine aerate high-traffic paths"}}
    ],
    "oneQuarter": [
      {{"task": "Pre-emergent herbicide barrier application", "urgency": "Critical", "category": "Protection", "tip": "Soil temp approaching 13°C / 55°F trigger window"}},
      {{"task": "Light cylinder roller roll & sand topdress dusting", "urgency": "Low", "category": "Levelling", "tip": "Promote true ball roll and bowling green smoothness"}}
    ],
    "halfYear": [
      {{"task": "Mid-season root booster & humic acid application", "urgency": "Medium", "category": "Soil", "tip": "Enhance deep root system ahead of seasonal shift"}},
      {{"task": "Reel blade lapping & knife adjustment", "urgency": "Medium", "category": "Equipment", "tip": "Keep cylinder cutting cylinder-paper sharp"}}
    ],
    "oneYear": [
      {{"task": "Annual Renovation: Scalp, Dethatch & Heavy Aeration", "urgency": "Critical", "category": "Renovation", "tip": "Full annual reset in peak active growth period"}},
      {{"task": "Annual Soil Test & pH balancing", "urgency": "High", "category": "Soil", "tip": "Send core samples to lab to calibrate annual NPK budget"}}
    ]
  }}
}}
"""
        api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        body = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": image_base64
                            }
                        }
                    ]
                }
            ],
            "generationConfig": {
                "response_mime_type": "application/json",
                "temperature": 0.2
            }
        }
        
        req = urllib.request.Request(
            api_url,
            data=json.dumps(body).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        
        with urllib.request.urlopen(req, timeout=30) as res:
            res_body = json.loads(res.read().decode('utf-8'))
            candidate = res_body['candidates'][0]['content']['parts'][0]['text']
            return json.loads(candidate)

    def send_json_response(self, status_code, data):
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    server_address = ('', port)
    httpd = HTTPServer(server_address, LawnAppHandler)
    print(f"🌱 GreenMaster AI Lawn Server running at http://localhost:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()
