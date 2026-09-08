from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import engine, Base, SessionLocal
from app.models import User, UserRole, Camera, Case, Evidence, Building
from app.core.security import get_password_hash

from app.api import auth, cameras, dashboard, videos, subjects, evidence, cases, reports, ai_search, buildings, floors, camera_connections, tracking, reid, trajectories

# Initialize tables
Base.metadata.create_all(bind=engine)


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Set up CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Seed initial database records if empty
def seed_initial_data():
    db = SessionLocal()
    try:
        # Create default Admin / Investigator if not exists, or update password
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            admin = User(
                username="admin",
                email="admin@sentinel.ai",
                hashed_password=get_password_hash("S3nt1n3l#Analytics2026!Key"),
                role=UserRole.ADMIN.value
            )
            db.add(admin)
        else:
            admin.hashed_password = get_password_hash("S3nt1n3l#Analytics2026!Key")
            db.add(admin)
            
        # Create initial buildings if none exist
        bldg_count = db.query(Building).count()
        if bldg_count == 0:
            bldg_a = Building(
                code="BLDG-A",
                name="Main Headquarters",
                description="Primary operational facility",
                address="Block A, Main Campus",
                floors_count=3
            )
            bldg_b = Building(
                code="BLDG-B",
                name="North Campus Annex",
                description="Secondary surveillance zone",
                address="Block B, North Campus",
                floors_count=2
            )
            db.add_all([bldg_a, bldg_b])
            db.flush()  # Get IDs before assigning to cameras

            # Seed initial floors for Building A
            from app.models.floor import Floor
            f1 = Floor(building_id=bldg_a.id, floor_number=1, floor_name="Floor 1 - Main Reception")
            f2 = Floor(building_id=bldg_a.id, floor_number=2, floor_name="Floor 2 - Executive Corridor")
            f3 = Floor(building_id=bldg_a.id, floor_number=3, floor_name="Floor 3 - Vault & Control Room")
            db.add_all([f1, f2, f3])
            db.flush()

            # Create initial cameras assigned to buildings and floors
            cams_count = db.query(Camera).count()
            if cams_count == 0:
                initial_cams = [
                    Camera(camera_code="CAM 01", name="Main Entrance South", location_description="South Building Gate", status="ONLINE", building_id=bldg_a.id, floor_id=f1.id, position_x=24.5, position_y=63.2, direction_angle=135.0, area_zone="Main Entrance", display_order=0),
                    Camera(camera_code="CAM 02", name="Lobby Central Corridor", location_description="Ground Floor Lobby", status="ONLINE", building_id=bldg_a.id, floor_id=f1.id, position_x=52.0, position_y=45.0, direction_angle=90.0, area_zone="Lobby", display_order=1),
                    Camera(camera_code="CAM 03", name="North Parking Gate", location_description="Parking Area Gate B", status="ONLINE", building_id=bldg_b.id, position_x=30.0, position_y=20.0, direction_angle=45.0, area_zone="Parking", display_order=0),
                    Camera(camera_code="CAM 04", name="Vault Perimeter Exit", location_description="West Wing Corridor", status="ONLINE", building_id=bldg_a.id, floor_id=f3.id, position_x=75.0, position_y=60.0, direction_angle=270.0, area_zone="Restricted Area", display_order=0),
                ]
                db.add_all(initial_cams)
            
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {e}")
    finally:
        db.close()

seed_initial_data()

# Register Routers
app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(buildings.router, prefix=settings.API_V1_STR)
app.include_router(floors.router, prefix=settings.API_V1_STR)
app.include_router(cameras.router, prefix=settings.API_V1_STR)
app.include_router(camera_connections.router, prefix=settings.API_V1_STR)
app.include_router(dashboard.router, prefix=settings.API_V1_STR)
app.include_router(videos.router, prefix=settings.API_V1_STR)
app.include_router(subjects.router, prefix=settings.API_V1_STR)
app.include_router(evidence.router, prefix=settings.API_V1_STR)
app.include_router(cases.router, prefix=settings.API_V1_STR)
app.include_router(reports.router, prefix=settings.API_V1_STR)
app.include_router(ai_search.router, prefix=settings.API_V1_STR)
app.include_router(tracking.router, prefix=settings.API_V1_STR)
app.include_router(reid.router, prefix=settings.API_V1_STR)
app.include_router(trajectories.router, prefix=settings.API_V1_STR)


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "system": settings.PROJECT_NAME,
        "version": "1.0.0",
        "api_v1": settings.API_V1_STR
    }

@app.get("/")
def root():
    return {
        "message": "Welcome to SENTINEL AI - CCTV Video Analytics Platform",
        "docs": "/docs",
        "health": "/health"
    }
