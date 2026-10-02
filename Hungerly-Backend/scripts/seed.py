"""Seed development data: Pune city and zone, the customer app's restaurants and menus, demo riders,
and a super admin.

Usage:  python scripts/seed.py --admin-email you@example.com

Idempotent for reference data (skips anything that already exists). Refuses to run in staging/production.
The admin's temporary password is printed once; the first login then enrols TOTP.
"""

from __future__ import annotations

import argparse
import asyncio
import secrets
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from app.core import crypto  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.db.session import dispose_engine, sessionmaker  # noqa: E402
from app.models import (  # noqa: E402
    AdminProfile,
    City,
    Cuisine,
    DeliveryPartner,
    MenuCategory,
    MenuItem,
    MenuOption,
    MenuOptionGroup,
    Restaurant,
    ServiceZone,
    User,
    UserRole,
)
from app.services.auth import phone_bidx  # noqa: E402
from app.services.geo import point  # noqa: E402

PHOTOS = {
    "burgerAndFries": "1561758033-d89a9ad46330", "butterChickenNaan": "1565557623262-b51c2513a641",
    "biryaniPlate": "1589302168068-964664d93dc0", "biryaniBowl": "1563379091339-03b21ab4a4f8",
    "chaiWithSpices": "1571934811356-5cc061b6821f", "chickenBowl": "1546069901-ba9599a7e63c",
    "chocolateCake": "1578985545062-69928b1d9587", "chocolateShake": "1563805042-7684c019e1cb",
    "classicBurger": "1568901346375-23c9450c58cd", "curryPlatter": "1585937421612-70a008356fbe",
    "doubleBurger": "1571091718767-18b5b1457add", "dosaPlatter": "1668236543090-82eba5ee5976",
    "donuts": "1551024601-bec78aea704b", "friedChicken": "1626082927389-6cd097cdc6ec",
    "friedRice": "1603133872878-684f208fb84b", "greensSalad": "1540189549336-e6e99c3679fe",
    "hakkaNoodles": "1585032226651-759b368d7246", "idliVada": "1630383249896-424e482df921",
    "kadaiCurry": "1596797038530-2c107229654b", "kebabsGrill": "1599487488170-d11ec9c172f0",
    "lemonRice": "1512058564366-18510be2db19", "margherita": "1574071318508-1cdbab80d002",
    "pannaCotta": "1488477181946-6428a0291777", "paneerMakhani": "1631452180519-c014fe946bc7",
    "pavBhaji": "1606491956689-2ea866880c84", "pepperoniPizza": "1513104890138-7c749659a591",
    "pizzaSlices": "1565299624946-b28f40a0ae38", "prawnCurry": "1559847844-5315695dadae",
    "samosa": "1601050690597-df0568f70950", "vegBowl": "1512621776951-a57141f2eefd",
}


def photo(key: str | None, width: int = 800) -> str | None:
    return f"https://images.unsplash.com/photo-{PHOTOS[key]}?auto=format&fit=crop&w={width}&q=70" if key else None


def g(name, mn, mx, opts):
    return {"name": name, "min": mn, "max": mx, "options": opts}


SPICE = g("Spice level", 1, 1, [("Mild", 0), ("Medium", 0), ("Hot", 0)])

# (slug, name, description, cuisines, photo, rating, count, prep, price_level, cost_for_two, pure_veg,
#  open, locality, lat, lng, packaging, min_order, menu)
RESTAURANTS = [
    ("tandoor-and-tales", "Tandoor & Tales", "Charcoal-grilled kebabs and slow-cooked curries from a family recipe book.",
     ["North Indian", "Mughlai", "Kebabs"], "butterChickenNaan", 4.5, 3120, 25, 2, 60000, False, True, "Koregaon Park",
     18.5408, 73.9010, 1500, 19900, [
         ("Recommended", [
             ("Butter Chicken", "Tandoori chicken simmered in a velvety tomato, butter and fenugreek gravy.", 34900, "non_veg", "butterChickenNaan", True, True,
              [g("Portion", 1, 1, [("Half (serves 1)", 0), ("Full (serves 2)", 18000)])]),
             ("Paneer Makhani", "Soft cottage cheese in a mildly sweet makhani gravy finished with cream.", 29900, "veg", "paneerMakhani", True, True, []),
             ("Charcoal Seekh Kebab", "Minced mutton skewers with ginger, green chilli and coriander, grilled over charcoal.", 38900, "non_veg", "kebabsGrill", False, True, []),
         ]),
         ("Curries", [
             ("Kadai Vegetables", "Seasonal vegetables tossed with bell peppers and freshly pounded kadai masala.", 25900, "veg", "kadaiCurry", False, True, [SPICE]),
             ("Dal Makhani", "Black lentils slow-cooked overnight with butter and cream.", 22900, "veg", None, True, True, []),
         ]),
         ("Breads", [
             ("Butter Naan", "Leavened bread from the tandoor, brushed with butter.", 6900, "veg", None, False, True, []),
             ("Garlic Naan", "Tandoor-baked naan topped with roasted garlic and coriander.", 7900, "veg", None, False, True, []),
         ]),
     ]),
    ("the-dosa-republic", "The Dosa Republic", "Crisp dosas, fluffy idlis and filter coffee, made fresh all day.",
     ["South Indian", "Breakfast"], "dosaPlatter", 4.6, 5480, 15, 1, 30000, True, True, "Kalyani Nagar",
     18.5466, 73.9006, 1000, 14900, [
         ("Dosas", [
             ("Mysore Masala Dosa", "Crisp rice-lentil crepe with red chutney and spiced potato, served with sambar.", 14900, "veg", "dosaPlatter", True, True,
              [g("Add extras", 0, 2, [("Extra butter", 2000), ("Cheese", 3500)])]),
             ("Ghee Roast Dosa", "Paper-thin dosa roasted in pure ghee until golden.", 12900, "veg", None, False, True, []),
         ]),
         ("Tiffin", [
             ("Idli Vada Combo", "Two steamed idlis and a crisp medu vada with sambar and coconut chutney.", 11900, "veg", "idliVada", False, True, []),
             ("Lemon Rice", "Tempered rice with lemon, peanuts, curry leaves and turmeric.", 12900, "veg", "lemonRice", False, True, []),
         ]),
         ("Beverages", [("Filter Coffee", "Strong decoction with frothy hot milk, served in a davara.", 6900, "veg", None, True, True, [])]),
     ]),
    ("biryani-baithak", "Biryani Baithak", "Dum-cooked Hyderabadi and Lucknowi biryanis, sealed and slow-cooked.",
     ["Biryani", "Mughlai"], "biryaniPlate", 4.4, 7890, 30, 2, 50000, False, True, "Camp",
     18.5158, 73.8780, 2000, 24900, [
         ("Biryani", [
             ("Hyderabadi Chicken Dum Biryani", "Marinated chicken and long-grain basmati sealed and slow-cooked with saffron.", 32900, "non_veg", "biryaniPlate", True, True,
              [g("Portion", 1, 1, [("Regular (serves 1)", 0), ("Family pack (serves 3)", 42000)]),
               g("Add sides", 0, 2, [("Boondi raita", 4900), ("Mirchi ka salan", 5900)])]),
             ("Subz Dum Biryani", "Seasonal vegetables and paneer layered with fragrant rice and fried onions.", 26900, "veg", "biryaniBowl", False, True, []),
             ("Egg Biryani", "Masala-roasted eggs over spiced dum rice.", 23900, "egg", None, False, True, []),
         ]),
     ]),
    ("bowl-theory", "Bowl Theory", "Protein-packed bowls and crunchy salads with house-made dressings.",
     ["Healthy", "Salads", "Bowls"], "vegBowl", 4.3, 960, 15, 2, 55000, False, True, "Koregaon Park",
     18.5380, 73.8965, 1500, 19900, [
         ("Bowls", [
             ("Grilled Chicken Power Bowl", "Herb chicken, quinoa, charred corn, cherry tomatoes and lime-yoghurt dressing.", 34900, "non_veg", "chickenBowl", True, True, []),
             ("Rainbow Buddha Bowl", "Avocado, roasted beets, chickpeas, greens and tahini.", 31900, "veg", "vegBowl", False, True, []),
         ]),
         ("Salads", [
             ("Green Goddess Salad", "Crunchy greens, cucumber, seeds and a herby avocado dressing.", 27900, "veg", "greensSalad", False, True,
              [g("Add protein", 0, 1, [("Grilled paneer", 6000), ("Grilled chicken", 8000)])]),
         ]),
     ]),
    ("smoke-street-burgers", "Smoke Street Burgers", "Smashed patties, brioche buns and fries cooked twice for extra crunch.",
     ["Burgers", "American", "Fast Food"], "burgerAndFries", 4.2, 2210, 20, 2, 45000, False, True, "Viman Nagar",
     18.5515, 73.9040, 1500, 19900, [
         ("Burgers", [
             ("Classic Smash Burger", "Double smashed chicken patty, cheddar, pickles and smoky house sauce.", 24900, "non_veg", "classicBurger", True, True,
              [g("Add-ons", 0, 3, [("Extra cheese slice", 3000), ("Fried egg", 3500), ("Jalapeños", 2000)])]),
             ("Double Trouble Burger", "Two patties, caramelised onions, lettuce and chipotle mayo.", 32900, "non_veg", "doubleBurger", False, True, []),
             ("Crispy Veg Burger", "Crumbed potato and pea patty with tangy slaw.", 17900, "veg", None, False, True, []),
         ]),
         ("Sides", [
             ("Twice-Cooked Fries", "Skin-on fries with peri-peri salt.", 12900, "veg", "burgerAndFries", False, True, []),
             ("Crispy Fried Chicken (4 pcs)", "Buttermilk-brined chicken with a crunchy spiced coating.", 29900, "non_veg", "friedChicken", False, False, []),
         ]),
     ]),
    ("forno-nonna", "Forno Nonna", "Neapolitan-style pizzas from a wood-fired oven, with 48-hour dough.",
     ["Pizza", "Italian"], "margherita", 4.7, 1430, 25, 3, 90000, False, True, "Boat Club Road",
     18.5330, 73.8800, 2500, 29900, [
         ("Wood-fired pizza", [
             ("Margherita", "San Marzano tomato, fior di latte and fresh basil.", 44900, "veg", "margherita", True, True,
              [g("Size", 1, 1, [("10 inch", 0), ("12 inch", 15000)])]),
             ("Spicy Pepperoni", "Chicken pepperoni, mozzarella, chilli oil and oregano.", 54900, "non_veg", "pepperoniPizza", False, True,
              [g("Size", 1, 1, [("10 inch", 0), ("12 inch", 16000)])]),
             ("Garden Bianca", "White base with ricotta, zucchini, olives and rocket.", 49900, "veg", "pizzaSlices", False, True, []),
         ]),
         ("Desserts", [("Strawberry Panna Cotta", "Vanilla bean cream set with fresh strawberry compote.", 24900, "veg", "pannaCotta", False, True, [])]),
     ]),
    ("wok-this-way", "Wok This Way", "Indo-Chinese favourites tossed in a blazing hot wok.",
     ["Chinese", "Asian"], "hakkaNoodles", 4.1, 3350, 20, 1, 40000, False, True, "Koregaon Park",
     18.5420, 73.8890, 1000, 14900, [
         ("Noodles & Rice", [
             ("Veg Hakka Noodles", "Wok-tossed noodles with cabbage, carrots, spring onion and soy.", 19900, "veg", "hakkaNoodles", True, True, [SPICE]),
             ("Chicken Fried Rice", "Smoky wok-fried rice with egg, chicken and vegetables.", 22900, "non_veg", "friedRice", False, True, []),
         ]),
         ("Starters", [("Chilli Paneer Dry", "Crisp paneer tossed with peppers, onions and a sweet-hot glaze.", 23900, "veg", None, False, True, [])]),
     ]),
    ("chai-and-chaat-corner", "Chai & Chaat Corner", "Pune street-food classics: pav bhaji, samosas and cutting chai.",
     ["Street Food", "Snacks", "Beverages"], "pavBhaji", 4.4, 6120, 10, 1, 25000, True, True, "North Main Road",
     18.5370, 73.8990, 500, 9900, [
         ("Street classics", [
             ("Butter Pav Bhaji", "Mashed vegetable bhaji with butter-toasted pav, onion and lemon.", 14900, "veg", "pavBhaji", True, True,
              [g("Extras", 0, 2, [("Extra pav (2 pcs)", 3000), ("Cheese", 3500)])]),
             ("Punjabi Samosa (2 pcs)", "Flaky pastry with spiced potato and peas, with mint and tamarind chutneys.", 6900, "veg", "samosa", False, True, []),
         ]),
         ("Chai", [("Masala Cutting Chai", "Strong tea brewed with ginger, cardamom and a secret spice mix.", 3900, "veg", "chaiWithSpices", False, True, [])]),
     ]),
    ("sugar-loaf-patisserie", "Sugar Loaf Patisserie", "Celebration cakes, doughnuts and chilled desserts baked every morning.",
     ["Desserts", "Bakery"], "chocolateCake", 4.6, 1780, 15, 2, 50000, False, False, "Kalyani Nagar",
     18.5480, 73.9030, 2000, 19900, [
         ("Cakes & bakes", [
             ("Belgian Chocolate Truffle Cake (500 g)", "Moist chocolate sponge layered with dark ganache.", 64900, "egg", "chocolateCake", True, True, []),
             ("Glazed Doughnuts (4 pcs)", "Pillowy doughnuts with a chocolate glaze and sprinkles.", 29900, "egg", "donuts", False, True, []),
             ("Chocolate Fudge Shake", "Thick chocolate shake with fudge sauce and cookie crumbs.", 21900, "veg", "chocolateShake", False, True, []),
         ]),
     ]),
    ("coastal-curry-co", "Coastal Curry Co.", "Konkan and Malabar coast seafood curries with steamed rice.",
     ["Coastal", "Seafood"], "prawnCurry", 4.3, 1190, 30, 3, 80000, False, True, "Mundhwa",
     18.5320, 73.9280, 2500, 29900, [
         ("Coastal curries", [
             ("Prawn Gassi with Rice", "Mangalorean prawn curry in coconut and byadgi chilli, with steamed rice.", 44900, "non_veg", "prawnCurry", True, True, []),
             ("Kerala Vegetable Stew", "Mild coconut milk stew with vegetables and whole spices.", 27900, "veg", "curryPlatter", False, True, []),
         ]),
     ]),
]

# Demo riders (development only). Phone numbers are in a reserved-looking range; log in with OTP 123456.
RIDERS = [
    ("Arjun Patil", "+919800000001", "motorcycle", "MH12AB1234", 18.5390, 73.8950),
    ("Sneha Kulkarni", "+919800000002", "ev_scooter", "MH12CD5678", 18.5450, 73.9000),
    ("Rahul Deshmukh", "+919800000003", "scooter", "MH14EF9012", 18.5300, 73.8850),
]

# East Pune (Koregaon Park, Kalyani Nagar, Viman Nagar, Camp, Mundhwa) as one MultiPolygon.
ZONE_WKT = "MULTIPOLYGON(((73.860 18.500, 73.950 18.500, 73.950 18.580, 73.860 18.580, 73.860 18.500)))"


def slugify(s: str) -> str:
    return "".join(ch if ch.isalnum() else "-" for ch in s.lower()).strip("-").replace("--", "-")


async def main(admin_email: str | None) -> None:
    settings = get_settings()
    if settings.is_production_like:
        sys.exit("refusing to seed a staging/production database")
    from geoalchemy2.elements import WKTElement

    async with sessionmaker()() as db:
        city = (await db.execute(select(City).where(City.name == "Pune"))).scalar_one_or_none()
        if city is None:
            city = City(name="Pune", state="Maharashtra", is_active=True)
            db.add(city)
            await db.flush()
        zone = (await db.execute(select(ServiceZone).where(ServiceZone.name == "East Pune"))).scalar_one_or_none()
        if zone is None:
            zone = ServiceZone(
                city_id=city.id, name="East Pune", boundary=WKTElement(ZONE_WKT, srid=4326), is_active=True,
                max_delivery_radius_m=8000, base_delivery_fee_minor=2500, per_km_fee_minor=600,
                free_delivery_threshold_minor=59900,
            )
            db.add(zone)
            await db.flush()

        cuisines: dict[str, Cuisine] = {c.name: c for c in (await db.execute(select(Cuisine))).scalars()}
        for r in RESTAURANTS:
            for name in r[3]:
                if name not in cuisines:
                    cuisines[name] = Cuisine(name=name, slug=slugify(name))
                    db.add(cuisines[name])
        await db.flush()

        created = 0
        for (slug, name, desc, cuis, ph, rating, count, prep, level, c42, veg, is_open, locality, lat, lng,
             packaging, min_order, menu) in RESTAURANTS:
            if (await db.execute(select(Restaurant.id).where(Restaurant.slug == slug))).first():
                continue
            r = Restaurant(
                slug=slug, display_name=name, description=desc, phone_e164="+912040000000", zone_id=zone.id,
                address_line1=f"{name}, {locality}", locality=locality, city="Pune", postal_code="411001",
                lat=lat, lng=lng, location=point(lat, lng), status="active", is_accepting_orders=is_open,
                is_pure_veg=veg, avg_prep_minutes=prep, price_level=level, cost_for_two_minor=c42,
                min_order_minor=min_order, packaging_fee_minor=packaging, commission_bps=1800,
                image_url=photo(ph), rating_avg=rating, rating_count=count, cuisines=[cuisines[c] for c in cuis],
            )
            db.add(r)
            await db.flush()
            for ci, (cat_name, items) in enumerate(menu):
                cat = MenuCategory(restaurant_id=r.id, name=cat_name, sort_order=ci)
                db.add(cat)
                await db.flush()
                for ii, (iname, idesc, price, ftype, iph, best, avail, groups) in enumerate(items):
                    item = MenuItem(
                        restaurant_id=r.id, category_id=cat.id, name=iname, description=idesc, price_minor=price,
                        food_type=ftype, image_url=photo(iph, 600), is_bestseller=best, is_available=avail, sort_order=ii,
                        option_groups=[
                            MenuOptionGroup(
                                name=grp["name"], min_select=grp["min"], max_select=grp["max"], sort_order=gi,
                                options=[MenuOption(name=on, price_delta_minor=od, sort_order=oi) for oi, (on, od) in enumerate(grp["options"])],
                            )
                            for gi, grp in enumerate(groups)
                        ],
                    )
                    db.add(item)
            created += 1
        print(f"restaurants created: {created}")

        for full_name, phone, vehicle, reg, lat, lng in RIDERS:
            bidx = phone_bidx(phone)
            if (await db.execute(select(User.id).where(User.phone_bidx == bidx))).first():
                continue
            u = User(phone_e164=phone, phone_bidx=bidx, full_name=full_name, roles=[])
            u.roles.append(UserRole(role="delivery_partner"))
            db.add(u)
            await db.flush()
            db.add(DeliveryPartner(
                user_id=u.id, zone_id=zone.id, status="active", vehicle_type=vehicle, vehicle_registration=reg,
                driving_license_number="MH1220190012345", approved_at=None, rating_avg=4.7, rating_count=120,
            ))
        await db.flush()

        if admin_email:
            email = admin_email.lower()
            if (await db.execute(select(User.id).where(User.email == email))).first():
                print(f"admin {email} already exists")
            else:
                password = secrets.token_urlsafe(15)
                u = User(email=email, full_name="Super Admin", password_hash=crypto.hash_password(password), roles=[])
                u.roles.append(UserRole(role="admin"))
                db.add(u)
                await db.flush()
                db.add(AdminProfile(user_id=u.id, admin_role="super_admin"))
                print("\n  Super admin created")
                print(f"  email:              {email}")
                print(f"  temporary password: {password}")
                print("  (shown once; sign in to the admin panel and enrol an authenticator app)\n")
        await db.commit()
    await dispose_engine()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--admin-email")
    args = parser.parse_args()
    asyncio.run(main(args.admin_email))
