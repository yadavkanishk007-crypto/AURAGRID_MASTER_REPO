import os
import csv

CITIES_METADATA = {
    "delhi": {
        "center": (28.7041, 77.1025),
        "divisions": {
            "DWARKA": (28.5889, 77.0578),
            "ROHINI": (28.7158, 77.1137),
            "OKHLA": (28.5284, 77.2721),
            "MAYUR VIHAR": (28.6094, 77.3006),
            "JANAKPURI": (28.6219, 77.0878),
            "CONNAUGHT PLACE": (28.6304, 77.2177),
            "KAROL BAGH": (28.6514, 77.1907),
            "SAKET": (28.4962, 77.2091)
        },
        "names": ["Sector 10 Dwarka", "Dwarka Sector 21", "Rohini Sector 3", "Rohini East", "Okhla Phase 3", "Okhla Industrial", "Mayur Vihar Ph 1", "Janakpuri West", "Connaught Place Ring", "Karol Bagh Market", "Saket District Centre", "Vasant Kunj Central", "Chanakyapuri", "Nehru Place Hub", "Lajpat Nagar Grid", "Chandni Chowk Core", "Rajouri Garden", "Pitampura Sector A", "Noida Border", "Gurugram Link"]
    },
    "pune": {
        "center": (18.5204, 73.8567),
        "divisions": {
            "HINJAWADI": (18.5913, 73.7389),
            "KOTHRUD": (18.5074, 73.8077),
            "SHIVAJINAGAR": (18.5308, 73.8549),
            "HADAPSAR": (18.5089, 73.9261),
            "BANER": (18.5590, 73.7975),
            "PIMPRI": (18.6278, 73.7997),
            "CAMP": (18.5134, 73.8789)
        },
        "names": ["Hinjawadi Phase I", "Hinjawadi Phase III", "Kothrud Depot", "Bhusari Colony", "Shivajinagar Station", "Pune University", "Hadapsar Ind Estate", "Magarpatta City", "Baner Balewadi Road", "Pimpri Chowk", "Chinchwad Hub", "Camp East", "Kalyani Nagar Grid", "Viman Nagar", "Kharadi Tech Park", "Katraj Hub", "Sinhagad Road Core", "Swargate Junction", "Aundh Sector", "Bhosari Sector"]
    },
    "bhopal": {
        "center": (23.2599, 77.4126),
        "divisions": {
            "GOVINDPURA": (23.2512, 77.4589),
            "KOLAR ROAD": (23.1784, 77.4182),
            "BAIRAGARH": (23.2847, 77.3458),
            "TT NAGAR": (23.2384, 77.3995),
            "MP NAGAR": (23.2324, 77.4321),
            "ARERA COLONY": (23.2124, 77.4291)
        },
        "names": ["Govindpura Industrial", "BHEL Sector A", "Kolar Road Core", "Bairagarh Town", "TT Nagar New Market", "MP Nagar Zone I", "MP Nagar Zone II", "Arera Colony Sect 3", "Habibganj Station", "Lalghati Grid", "Kohefiza Sector", "Jahangirabad Core", "Misrod Link", "Ayodhya Bypass", "Katara Hills Sector"]
    },
    "lucknow": {
        "center": (26.8467, 80.9462),
        "divisions": {
            "GOMTI NAGAR": (26.8624, 81.0024),
            "CHARBAGH": (26.8312, 80.9238),
            "ALIGANJ": (26.8856, 80.9412),
            "INDIRA NAGAR": (26.8884, 80.9921),
            "HAZRATGANJ": (26.8492, 80.9452),
            "CHOWK": (26.8678, 80.8984),
            "AMINABAD": (26.8424, 80.9254)
        },
        "names": ["Gomti Nagar Extension", "Patrakar Puram", "Charbagh Junction", "Aliganj Sector H", "Indira Nagar Sector 14", "Hazratganj GPO", "Chowk Bazaar", "Aminabad Market", "Jankipuram Core", "Mahanagar Sector", "Vikas Nagar Hub", "Sanjay Gandhi PGI Link", "Ashiyana Colony", "Chinhat Industrial", "Amausi Airport Core"]
    },
    "jhansi": {
        "center": (25.4484, 78.5685),
        "divisions": {
            "CIVIL LINES": (25.4544, 78.5721),
            "SADAR BAZAR": (25.4344, 78.5645),
            "SIPRI BAZAAR": (25.4462, 78.5489),
            "JHANSI FORT": (25.4589, 78.5784),
            "HANSARI": (25.4184, 78.5458)
        },
        "names": ["Civil Lines Grid", "Jhansi Fort Area", "Sadar Bazar Core", "Sipri Bazaar East", "Hansari Substation", "Medical College Link", "Bundelkhand Univ Grid", "Talpura Sector", "Panchavati Sector", "Jhansi Cantt Sector", "Gwalior Road Link", "Kanpur Road Link"]
    }
}

def generate_kml(city_name, divisions, output_path):
    kml_lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<kml xmlns="http://www.opengis.net/kml/2.2">',
        '<Document>',
        f'\t<name>{city_name.capitalize()} Divisions</name>'
    ]
    
    for div_name, (lat, lng) in divisions.items():
        # Create a rectangle box polygon of about 0.04 x 0.04 degrees around centroid
        offset = 0.02
        coords = [
            (lng - offset, lat - offset),
            (lng + offset, lat - offset),
            (lng + offset, lat + offset),
            (lng - offset, lat + offset),
            (lng - offset, lat - offset) # Close loop
        ]
        coords_str = ' '.join(f"{c[0]},{c[1]},0" for c in coords)
        
        kml_lines.extend([
            '\t<Placemark>',
            '\t\t<ExtendedData>',
            '\t\t\t<SchemaData>',
            f'\t\t\t\t<SimpleData name="DivisionName">{div_name}</SimpleData>',
            '\t\t\t</SchemaData>',
            '\t\t</ExtendedData>',
            '\t\t<Polygon>',
            '\t\t\t<outerBoundaryIs>',
            '\t\t\t\t<LinearRing>',
            f'\t\t\t\t\t<coordinates>{coords_str}</coordinates>',
            '\t\t\t\t</LinearRing>',
            '\t\t\t</outerBoundaryIs>',
            '\t\t</Polygon>',
            '\t</Placemark>'
        ])
        
    kml_lines.extend([
        '</Document>',
        '</kml>'
    ])
    
    with open(output_path, "w", encoding="utf-8") as f:
        f.write('\n'.join(kml_lines))

def generate_substations_csv(city_name, divisions, names, output_path):
    # Generates a dynamic CSV with 80-120 substations
    rows = [["Sl. No", "Zone", "District", "Taluk", "Name of Sub-Station", "Voltage Class (in kV)", "Date of commission"]]
    
    sl_no = 1
    # Generate 12-15 substations per division
    import random
    random.seed(42) # Deterministic data
    
    for div_name, (lat, lng) in divisions.items():
        # Make principal transmission core hub
        rows.append([
            str(sl_no),
            city_name.upper(),
            city_name.capitalize(),
            div_name.capitalize(),
            f"{div_name.capitalize()} Hub",
            "400",
            "12-04-2005"
        ])
        sl_no += 1
        
        # Second transmission node
        rows.append([
            str(sl_no),
            city_name.upper(),
            city_name.capitalize(),
            div_name.capitalize(),
            f"{div_name.capitalize()} Grid",
            "220",
            "18-09-2009"
        ])
        sl_no += 1
        
        # Several local substations
        local_count = random.randint(8, 12)
        for i in range(local_count):
            sub_name = f"{div_name.capitalize()} Sector {i+1}"
            volts = "66"
            if i % 4 == 0:
                volts = "220" # 25% are 220kV transmission lines
                
            rows.append([
                str(sl_no),
                city_name.upper(),
                city_name.capitalize(),
                div_name.capitalize(),
                sub_name,
                volts,
                f"{random.randint(1,28):02d}-{random.randint(1,12):02d}-{random.randint(1995, 2022)}"
            ])
            sl_no += 1
            
    with open(output_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(rows)

def generate_lines_stats_csv(divisions, output_path):
    rows = [["Sl. No.", "Divisions", "Overhead(OH) Added for 2023-24", "OH Dismantled in 2023-24", "OH Cables Total", "Underground(UG) Added for 2023-24", "UG Dismantled in 2023-24", "UG Total", "Ariel Bundled(AB) Cables Added for 2019-20", "AB Cables Dismantled in 2019-20", "AB Cables Total", "Total Cable Length (km)"]]
    
    sl_no = 1
    import random
    random.seed(42)
    
    for div_name in divisions.keys():
        oh = round(random.uniform(50.0, 500.0), 3)
        ug = round(random.uniform(200.0, 1200.0), 3)
        ab = round(random.uniform(10.0, 100.0), 3)
        tot = round(oh + ug + ab, 3)
        
        rows.append([
            str(sl_no),
            div_name.capitalize(),
            "0", "0", str(oh),
            "10.0", "0", str(ug),
            "0", "0", str(ab),
            str(tot)
        ])
        sl_no += 1
        
    with open(output_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(rows)

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    src_data_dir = os.path.join(base_dir, "WEBCOMMAND", "src", "data")
    pub_data_dir = os.path.join(base_dir, "WEBCOMMAND", "public", "data")
    
    os.makedirs(src_data_dir, exist_ok=True)
    os.makedirs(pub_data_dir, exist_ok=True)
    
    print(f"Target directories:\n- {src_data_dir}\n- {pub_data_dir}")
    
    for city, meta in CITIES_METADATA.items():
        print(f"\nGenerating datasets for city: {city.upper()}...")
        
        # 1. Boundaries KML
        kml_name = f"{city}_boundary.kml"
        generate_kml(city, meta["divisions"], os.path.join(src_data_dir, kml_name))
        generate_kml(city, meta["divisions"], os.path.join(pub_data_dir, kml_name))
        print(f" -> Generated boundary KML: {kml_name}")
        
        # 2. Substations CSV
        sub_name = f"{city}_substations.csv"
        generate_substations_csv(city, meta["divisions"], meta["names"], os.path.join(src_data_dir, sub_name))
        generate_substations_csv(city, meta["divisions"], meta["names"], os.path.join(pub_data_dir, sub_name))
        print(f" -> Generated substations CSV: {sub_name}")
        
        # 3. High Tension / Low Tension Stats
        ht_name = f"{city}_ht_lines.csv"
        lt_name = f"{city}_lt_lines.csv"
        generate_lines_stats_csv(meta["divisions"], os.path.join(src_data_dir, ht_name))
        generate_lines_stats_csv(meta["divisions"], os.path.join(pub_data_dir, ht_name))
        generate_lines_stats_csv(meta["divisions"], os.path.join(src_data_dir, lt_name))
        generate_lines_stats_csv(meta["divisions"], os.path.join(pub_data_dir, lt_name))
        print(" -> Generated line statistics CSVs")

if __name__ == "__main__":
    main()
