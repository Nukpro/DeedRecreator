# План реализации MVP: Хранилище векторных объектов (JSON)

## Структура данных

**Site (Площадка)** → **GeometryLayer (Слой геометрии)** → **Parcel (Участок)** → **Geometry (Геометрия)** → **Segments (Сегменты)**

- Site: площадка заказчика, содержит слои геометрии
- GeometryLayer: типы `Boundary`, `LOT`, `Easement`, `Road-axes`, `Alignments` - конвертируются в слои DXF с управлением видимостью
- Parcel: порядковые номера (1, 2, 3...), содержат геометрию
- Geometry: сегменты `Line` и `Curve` (arc) с координатами и атрибутами

## Требования

- Синхронное сохранение векторов из фронтенда в бэкенд
- Версионирование: 
  - Временное хранение версий в каталоге `tmp/` (максимум 20 файлов)
  - После каждого действия создается файл версии в `tmp/`, связывается с предыдущим
  - При достижении лимита в 20 файлов самый ранний удаляется
  - По кнопке "отменить" загружается предыдущая версия из `tmp/`
  - `history` хранит только связь с предыдущим файлом, без описания изменений
- Долгосрочное хранилище: вехи в файловой системе
- Экспорт: LandXML (Civil3D) и DXF

---

## 1. Формат хранения

### In-Memory + JSON файлы

- **В памяти**: Python `dict` для активных сессий
- **На диске**: JSON файлы в `instance/storage/`

### Структура данных Site

```json
{
  "projectId": "uuid",
  "siteId": "uuid",
  "name": "Site 1",
  "geometryLayers": [
    {
      "geometryLayerId": "uuid",
      "geometryLayerType": "Boundary|LOT|Easement|Road-axes|Alignments",
      "name": "Boundary Layer",
      "visible": true,
      "parcels": [
        {
          "id": "uuid",
          "number": 1,
          "name": "Property : 1",
          "area": 18366.914443546386,
          "geometry": {
            "type": "Polygon",
            "isClosed": true,
            "segments": [
              {
                "segmentType": "line",
                "start": { "x": 7314.945046752691, "y": 2636.169436127413 },
                "end": { "x": 7397.022065373603, "y": 2636.169436127413 },
                "length": 82.077018620912,
                "bearing": 90.0
              },
              {
                "segmentType": "arc",
                "start": { "x": 7397.022065373603, "y": 2636.169436127413 },
                "end": { "x": 7397.022065373603, "y": 2686.87124890415 },
                "center": { "x": 7440.854390648436, "y": 2661.520342515782 },
                "radius": 50.635374924163,
                "delta": 299.913174238327,
                "rot": "cw"
              }
            ]
          },
          "attributes": { "description": "" }
        }
      ]
    }
  ],
  "version": 1,
  "history": {
    "currentVersion": 1,
    "previousVersionFile": null
  }
}
```

### Версионирование

**Временное хранение версий:**
- Каталог `tmp/` создается для каждого Site
- После каждого действия, инициирующего отправку векторного файла в бэкенд, создается файл версии в `tmp/`
- Файлы версий связываются друг с другом (каждый файл знает путь к предыдущему)
- Максимум 20 файлов в `tmp/` - при достижении лимита самый ранний файл удаляется

**Структура history:**
- `history` хранит только связь с предыдущим файлом версии
- Не содержит описания изменений, только путь к предыдущей версии

```json
{
  "version": 5,
  "history": {
    "currentVersion": 5,
    "previousVersionFile": "tmp/version_4.json"
  }
}
```

**Структура файла версии в tmp:**
- Файлы именуются: `version_{version_number}.json`
- Каждый файл содержит полный снэпшот состояния Site на момент версии
- Связь между версиями хранится в `current.json` в поле `history.previousVersionFile`
- При отмене действия загружается файл из `tmp/` по пути из `history.previousVersionFile`

---

## 2. Структура файловой системы

```
instance/
└── storage/
    └── projects/
        └── {project_id}/
            └── sites/
                └── {site_id}/
                    ├── current.json          # Текущая версия
                    ├── tmp/                  # Временные версии для отмены (макс. 20 файлов)
                    │   ├── version_1.json
                    │   ├── version_2.json
                    │   └── ...
                    ├── milestones/
                    │   └── milestone_{timestamp}.json
                    └── exports/
                        ├── {timestamp}_landxml.xml
                        └── {timestamp}_dxf.dxf
```

---

## 3. API Endpoints

### `POST /api/vector/save`

**Request:**
```json
{
  "projectId": "uuid",
  "siteId": "uuid",
  "geometryLayerId": "uuid",
  "geometryLayerType": "Boundary",
  "name": "Site 1",
  "action": "add_geometry_layer|modify_geometry_layer|delete_geometry_layer|add_parcel|modify_parcel|delete_parcel|modify_segment|add_segment|delete_segment",
  "data": {
    "parcelId": "uuid",
    "parcelNumber": 1,
    "geometry": { /* геометрия */ },
    "attributes": { /* атрибуты */ }
  }
}
```

**Response:**
```json
{
  "success": true,
  "siteId": "uuid",
  "geometryLayerId": "uuid",
  "version": 5,
  "historyCount": 5
}
```

### `GET /api/vector/{site_id}`

**Response:**
```json
{
  "siteId": "uuid",
  "name": "Site 1",
  "version": 5,
  "geometryLayers": [ /* массив geometryLayers */ ],
  "lastUpdated": "2025-11-20T13:33:16Z"
}
```

### `GET /api/vector/{site_id}/layer/{geometry_layer_id}`

**Response:**
```json
{
  "siteId": "uuid",
  "geometryLayerId": "uuid",
  "geometryLayerType": "Boundary",
  "name": "Boundary Layer",
  "visible": true,
  "parcels": [ /* массив parcels */ ],
  "lastUpdated": "2025-11-20T13:33:16Z"
}
```

### `GET /api/vector/{site_id}/history`

**Response:**
```json
{
  "siteId": "uuid",
  "version": 5,
  "history": {
    "currentVersion": 5,
    "previousVersionFile": "tmp/version_4.json"
  }
}
```

### `GET /api/vector/{site_id}/layer/{geometry_layer_id}/history`

**Response:**
```json
{
  "siteId": "uuid",
  "geometryLayerId": "uuid",
  "version": 5,
  "history": {
    "currentVersion": 5,
    "previousVersionFile": "tmp/version_4.json"
  }
}
```

### `POST /api/vector/{site_id}/undo`

**Response:**
```json
{
  "success": true,
  "version": 4,
  "previousVersion": 5
}
```

### `POST /api/vector/{site_id}/redo`

**Response:**
```json
{
  "success": true,
  "version": 6,
  "previousVersion": 5
}
```

### `POST /api/vector/{site_id}/milestone`

**Request:**
```json
{
  "description": "First complete version"
}
```

**Response:**
```json
{
  "success": true,
  "milestoneId": "milestone_20251120T140000Z",
  "filePath": "sites/{site_id}/milestones/milestone_20251120T140000Z.json",
  "version": 10
}
```

### `GET /api/vector/{site_id}/export?format=landxml`

**Response:** XML файл (LandXML 1.2)

### `GET /api/vector/{site_id}/export?format=dxf`

**Response:** DXF файл (каждый GeometryLayer экспортируется как отдельный слой DXF)

---

## 4. Пошаговая реализация

### Шаг 1: Доменные модели

**Создать:** `backend/domain/vectors.py`

```python
from dataclasses import dataclass
from typing import List, Dict, Any
from datetime import datetime

@dataclass
class Segment:
    segmentType: str  # "line" | "arc"
    start: Dict[str, float]
    end: Dict[str, float]
    # для line: length, bearing
    # для arc: center, radius, delta, rot, и т.д.

@dataclass
class Geometry:
    type: str
    isClosed: bool
    segments: List[Segment]

@dataclass
class Parcel:
    id: str
    number: int
    name: str
    area: float
    geometry: Geometry
    attributes: Dict[str, Any]

@dataclass
class GeometryLayer:
    geometryLayerId: str
    geometryLayerType: str  # "Boundary" | "LOT" | "Easement" | "Road-axes" | "Alignments"
    name: str
    visible: bool
    parcels: List[Parcel]

@dataclass
class Site:
    projectId: str
    siteId: str
    name: str
    geometryLayers: List[GeometryLayer]
    version: int
    history: Dict[str, Any]  # {"currentVersion": int, "previousVersionFile": str | None}
    
    def to_dict(self) -> Dict[str, Any]:
        # Сериализация в JSON
        pass
```

**Создать:** `backend/domain/versioning.py`

```python
from dataclasses import dataclass
from datetime import datetime

@dataclass
class HistoryEntry:
    version: int
    timestamp: datetime
    action: str
    actionData: Dict[str, Any]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "version": self.version,
            "timestamp": self.timestamp.isoformat(),
            "action": self.action,
            "actionData": self.actionData
        }
```

**Действия:**
1. Создать файлы с dataclass моделями
2. Добавить методы `to_dict()` для сериализации
3. Добавить методы `from_dict()` для десериализации

---

### Шаг 2: In-Memory хранилище

**Создать:** `backend/storage/vector_storage.py`

```python
from typing import Dict, Optional
from backend.domain.vectors import Site, GeometryLayer

class VectorStorage:
    def __init__(self):
        self._sites: Dict[str, Site] = {}  # site_id -> Site
    
    def get_site(self, site_id: str) -> Optional[Site]:
        """Получить Site из памяти"""
        return self._sites.get(site_id)
    
    def save_site(self, site: Site) -> None:
        """Сохранить Site в памяти"""
        self._sites[site.siteId] = site
    
    def delete_site(self, site_id: str) -> None:
        """Удалить Site из памяти"""
        self._sites.pop(site_id, None)
    
    def get_all_site_ids(self) -> List[str]:
        """Получить все ID активных сессий"""
        return list(self._sites.keys())
    
    def get_geometry_layer(self, site_id: str, geometry_layer_id: str) -> Optional[GeometryLayer]:
        """Получить GeometryLayer из памяти"""
        site = self.get_site(site_id)
        if site:
            for layer in site.geometryLayers:
                if layer.geometryLayerId == geometry_layer_id:
                    return layer
        return None
```

**Действия:**
1. Создать класс `VectorStorage` с dict для хранения
2. Реализовать методы get/save/delete
3. Добавить в container для dependency injection

---

### Шаг 3: Vector Service

**Создать:** `backend/services/vector_service.py`

```python
from backend.domain.vectors import Site, Parcel, GeometryLayer
from backend.storage.vector_storage import VectorStorage
from backend.storage.file_storage import FileVectorStorage
import uuid

class VectorService:
    def __init__(self, memory_storage: VectorStorage, file_storage: FileVectorStorage):
        self._memory = memory_storage
        self._file_storage = file_storage
    
    def get_current_state(self, site_id: str) -> Site:
        """Получить текущее состояние Site"""
        # 1. Проверить в памяти
        site = self._memory.get_site(site_id)
        if site:
            return site
        
        # 2. Загрузить из файла
        site = self._file_storage.load_site(site_id)
        if site:
            self._memory.save_site(site)
            return site
        
        raise ValueError(f"Site {site_id} not found")
    
    def save_vector_action(
        self,
        project_id: str,
        site_id: str,
        geometry_layer_id: str,
        action_type: str,
        action_data: Dict[str, Any]
    ) -> Site:
        """Сохранить действие и создать новую версию"""
        # 1. Получить текущее состояние
        site = self.get_current_state(site_id)
        
        # 2. Сохранить текущую версию в tmp/ перед изменением
        previous_version_file = self._file_storage.save_version_to_tmp(site)
        
        # 3. Применить действие
        site = self._apply_action(site, geometry_layer_id, action_type, action_data)
        
        # 4. Увеличить версию
        site.version += 1
        
        # 5. Обновить историю (только связь с предыдущим файлом)
        site.history = {
            "currentVersion": site.version,
            "previousVersionFile": previous_version_file
        }
        
        # 6. Очистить старые версии в tmp/ (максимум 20 файлов)
        self._file_storage.cleanup_old_versions(site_id, max_versions=20)
        
        # 7. Сохранить в память
        self._memory.save_site(site)
        
        # 8. Сохранить в файл current.json
        self._file_storage.save_site(site)
        
        return site
    
    def _apply_action(self, site: Site, geometry_layer_id: str, action_type: str, data: Dict[str, Any]) -> Site:
        """Применить действие к Site"""
        # Найти или создать GeometryLayer
        geometry_layer = self._find_geometry_layer(site, geometry_layer_id)
        if not geometry_layer:
            if action_type == "add_geometry_layer":
                geometry_layer = GeometryLayer(
                    geometryLayerId=geometry_layer_id,
                    geometryLayerType=data.get("geometryLayerType", "Boundary"),
                    name=data.get("name", "New Layer"),
                    visible=True,
                    parcels=[]
                )
                site.geometryLayers.append(geometry_layer)
            else:
                raise ValueError(f"GeometryLayer {geometry_layer_id} not found")
        
        if action_type == "add_parcel":
            parcel = Parcel(
                id=data.get("parcelId", str(uuid.uuid4())),
                number=data["parcelNumber"],
                name=data.get("name", f"Property : {data['parcelNumber']}"),
                area=data.get("area", 0.0),
                geometry=data["geometry"],
                attributes=data.get("attributes", {})
            )
            geometry_layer.parcels.append(parcel)
        
        elif action_type == "modify_parcel":
            parcel = self._find_parcel(geometry_layer, data["parcelId"])
            # Обновить parcel из data
        
        elif action_type == "delete_parcel":
            geometry_layer.parcels = [p for p in geometry_layer.parcels if p.id != data["parcelId"]]
        
        elif action_type == "modify_geometry_layer":
            if "visible" in data:
                geometry_layer.visible = data["visible"]
            if "name" in data:
                geometry_layer.name = data["name"]
        
        elif action_type == "delete_geometry_layer":
            site.geometryLayers = [l for l in site.geometryLayers if l.geometryLayerId != geometry_layer_id]
        
        # Аналогично для modify_segment, add_segment, delete_segment
        
        return site
    
    def _find_geometry_layer(self, site: Site, geometry_layer_id: str) -> Optional[GeometryLayer]:
        """Найти GeometryLayer в Site"""
        for layer in site.geometryLayers:
            if layer.geometryLayerId == geometry_layer_id:
                return layer
        return None
    
    def _find_parcel(self, geometry_layer: GeometryLayer, parcel_id: str) -> Optional[Parcel]:
        """Найти Parcel в GeometryLayer"""
        for parcel in geometry_layer.parcels:
            if parcel.id == parcel_id:
                return parcel
        return None
    
    def undo(self, site_id: str) -> Site:
        """Отменить последнее действие - загрузить предыдущую версию из tmp/"""
        site = self.get_current_state(site_id)
        if not site.history or not site.history.get("previousVersionFile"):
            raise ValueError("No actions to undo")
        
        # Загрузить предыдущую версию из tmp/
        previous_version_file = site.history["previousVersionFile"]
        previous_site = self._file_storage.load_version_from_tmp(site_id, previous_version_file)
        
        if not previous_site:
            raise ValueError(f"Previous version file {previous_version_file} not found")
        
        # Обновить версию и историю
        previous_site.version = site.version - 1
        # История предыдущей версии уже содержит связь с её предыдущим файлом
        
        # Сохранить восстановленную версию
        self._memory.save_site(previous_site)
        self._file_storage.save_site(previous_site)
        
        return previous_site
    
    def get_geometry_layer(self, site_id: str, geometry_layer_id: str) -> Optional[GeometryLayer]:
        """Получить GeometryLayer из Site"""
        site = self.get_current_state(site_id)
        return self._find_geometry_layer(site, geometry_layer_id)
```

**Действия:**
1. Создать класс `VectorService`
2. Реализовать `get_current_state()`: память → файл → ошибка
3. Реализовать `save_vector_action()`: 
   - Сохранить текущую версию в tmp/ перед изменением
   - Применить действие
   - Увеличить версию
   - Обновить history (только связь с предыдущим файлом)
   - Очистить старые версии в tmp/ (максимум 20)
   - Сохранить в память и current.json
4. Реализовать `_apply_action()` для всех типов действий
5. Реализовать `undo()`: загрузить предыдущую версию из tmp/ и восстановить состояние

---

### Шаг 4: File Storage

**Создать:** `backend/storage/file_storage.py`

```python
from pathlib import Path
from backend.domain.vectors import Site
import json

class FileVectorStorage:
    def __init__(self, storage_root: Path):
        self._root = storage_root
        self._root.mkdir(parents=True, exist_ok=True)
    
    def get_site_path(self, project_id: str, site_id: str) -> Path:
        """Получить путь к файлу current.json для Site"""
        return self._root / "projects" / project_id / "sites" / site_id / "current.json"
    
    def load_site(self, site_id: str) -> Optional[Site]:
        """Загрузить Site из файла"""
        # Для MVP: найти файл по site_id
        # В будущем: индекс project_id -> site_id
        site_path = self._find_site_file(site_id)
        if not site_path or not site_path.exists():
            return None
        
        with open(site_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        return Site.from_dict(data)
    
    def save_site(self, site: Site) -> None:
        """Сохранить Site в файл"""
        site_path = self.get_site_path(site.projectId, site.siteId)
        site_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(site_path, 'w', encoding='utf-8') as f:
            json.dump(site.to_dict(), f, indent=2, ensure_ascii=False)
    
    def _find_site_file(self, site_id: str) -> Optional[Path]:
        """Найти файл current.json по site_id"""
        # Простой поиск по всем проектам
        projects_dir = self._root / "projects"
        if not projects_dir.exists():
            return None
        
        for project_dir in projects_dir.iterdir():
            sites_dir = project_dir / "sites"
            if sites_dir.exists():
                for site_dir in sites_dir.iterdir():
                    if site_dir.name == site_id:
                        return site_dir / "current.json"
        return None
    
    def get_tmp_dir(self, project_id: str, site_id: str) -> Path:
        """Получить путь к каталогу tmp/ для Site"""
        return self._root / "projects" / project_id / "sites" / site_id / "tmp"
    
    def save_version_to_tmp(self, site: Site) -> str:
        """Сохранить версию Site в tmp/ и вернуть путь к файлу"""
        tmp_dir = self.get_tmp_dir(site.projectId, site.siteId)
        tmp_dir.mkdir(parents=True, exist_ok=True)
        
        version_file = tmp_dir / f"version_{site.version}.json"
        
        # Сохранить полный снэпшот состояния
        with open(version_file, 'w', encoding='utf-8') as f:
            json.dump(site.to_dict(), f, indent=2, ensure_ascii=False)
        
        # Вернуть относительный путь от корня storage
        return f"tmp/version_{site.version}.json"
    
    def load_version_from_tmp(self, site_id: str, version_file_path: str) -> Optional[Site]:
        """Загрузить версию Site из tmp/"""
        # Найти site_dir для получения project_id
        site_dir = self._find_site_dir(site_id)
        if not site_dir:
            return None
        
        project_id = site_dir.parent.parent.name
        tmp_dir = self.get_tmp_dir(project_id, site_id)
        version_file = tmp_dir / Path(version_file_path).name
        
        if not version_file.exists():
            return None
        
        with open(version_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        return Site.from_dict(data)
    
    def cleanup_old_versions(self, site_id: str, max_versions: int = 20) -> None:
        """Удалить старые версии из tmp/, оставив только последние max_versions"""
        # Найти site_dir для получения project_id
        site_dir = self._find_site_dir(site_id)
        if not site_dir:
            return
        
        project_id = site_dir.parent.parent.name
        tmp_dir = self.get_tmp_dir(project_id, site_id)
        
        if not tmp_dir.exists():
            return
        
        # Получить все файлы версий и отсортировать по номеру версии
        version_files = []
        for file in tmp_dir.glob("version_*.json"):
            try:
                version_num = int(file.stem.split("_")[1])
                version_files.append((version_num, file))
            except (ValueError, IndexError):
                continue
        
        # Сортировать по номеру версии
        version_files.sort(key=lambda x: x[0])
        
        # Удалить самые старые файлы, если превышен лимит
        if len(version_files) > max_versions:
            files_to_delete = version_files[:-max_versions]
            for _, file in files_to_delete:
                file.unlink()
    
    def _find_site_dir(self, site_id: str) -> Optional[Path]:
        """Найти директорию Site по site_id"""
        projects_dir = self._root / "projects"
        if not projects_dir.exists():
            return None
        
        for project_dir in projects_dir.iterdir():
            sites_dir = project_dir / "sites"
            if sites_dir.exists():
                for site_dir in sites_dir.iterdir():
                    if site_dir.name == site_id:
                        return site_dir
        return None
```

**Действия:**
1. Создать класс `FileVectorStorage`
2. Реализовать `load_site()`: поиск файла → чтение JSON → десериализация
3. Реализовать `save_site()`: создание директорий → сериализация → запись JSON
4. Реализовать `save_version_to_tmp()`: сохранение версии в tmp/ каталог
5. Реализовать `load_version_from_tmp()`: загрузка версии из tmp/
6. Реализовать `cleanup_old_versions()`: удаление старых версий (максимум 20 файлов)
7. Добавить метод поиска файла по site_id

---

### Шаг 5: API Routes

**Создать:** `backend/api/vectors/__init__.py`

```python
from flask import Blueprint

vectors_bp = Blueprint("vectors", __name__)

from backend.api.vectors import routes
```

**Создать:** `backend/api/vectors/routes.py`

```python
from flask import request, jsonify
from backend.api.vectors import vectors_bp
from backend.app.container import get_vector_service

@vectors_bp.post("/api/vector/save")
def save_vector():
    """Сохранение действия"""
    data = request.json
    vector_service = get_vector_service()
    
    try:
        result = vector_service.save_vector_action(
            project_id=data["projectId"],
            site_id=data["siteId"],
            geometry_layer_id=data["geometryLayerId"],
            action_type=data["action"],
            action_data=data["data"]
        )
        return jsonify({
            "success": True,
            "siteId": result.siteId,
            "geometryLayerId": data["geometryLayerId"],
            "version": result.version,
            "historyCount": len(result.history)
        }), 200
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 400

@vectors_bp.get("/api/vector/<site_id>")
def get_vector(site_id: str):
    """Получить текущее состояние Site"""
    vector_service = get_vector_service()
    try:
        site = vector_service.get_current_state(site_id)
        return jsonify(site.to_dict()), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 404

@vectors_bp.get("/api/vector/<site_id>/layer/<geometry_layer_id>")
def get_geometry_layer(site_id: str, geometry_layer_id: str):
    """Получить текущее состояние GeometryLayer"""
    vector_service = get_vector_service()
    try:
        site = vector_service.get_current_state(site_id)
        geometry_layer = vector_service.get_geometry_layer(site_id, geometry_layer_id)
        if not geometry_layer:
            return jsonify({"message": f"GeometryLayer {geometry_layer_id} not found"}), 404
        return jsonify(geometry_layer.to_dict()), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 404

@vectors_bp.get("/api/vector/<site_id>/history")
def get_history(site_id: str):
    """Получить историю Site"""
    vector_service = get_vector_service()
    try:
        site = vector_service.get_current_state(site_id)
        return jsonify({
            "siteId": site.siteId,
            "version": site.version,
            "history": site.history
        }), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 404

@vectors_bp.post("/api/vector/<site_id>/undo")
def undo_action(site_id: str):
    """Отменить последнее действие"""
    vector_service = get_vector_service()
    try:
        site = vector_service.undo(site_id)
        return jsonify({
            "success": True,
            "version": site.version
        }), 200
    except ValueError as e:
        return jsonify({"message": str(e)}), 400
```

**Действия:**
1. Создать Blueprint `vectors_bp`
2. Реализовать все endpoints из раздела 3
3. Добавить обработку ошибок
4. Зарегистрировать blueprint в `backend/app/__init__.py`

---

### Шаг 6: Container / Dependency Injection

**Обновить:** `backend/app/container.py`

```python
VECTOR_SERVICE_KEY = "vector_service"
STORAGE_DIR_KEY = "storage_dir"

def register_services(app) -> None:
    from backend.storage.vector_storage import VectorStorage
    from backend.storage.file_storage import FileVectorStorage
    from backend.services.vector_service import VectorService
    from pathlib import Path
    
    # In-Memory хранилище
    memory_storage = VectorStorage()
    
    # File хранилище
    storage_dir = Path(app.config.get("STORAGE_DIR", "instance/storage"))
    file_storage = FileVectorStorage(storage_dir)
    
    # Vector Service
    vector_service = VectorService(memory_storage, file_storage)
    app.extensions[VECTOR_SERVICE_KEY] = vector_service

def get_vector_service() -> VectorService:
    from flask import current_app
    return current_app.extensions[VECTOR_SERVICE_KEY]
```

**Обновить:** `backend/config.py`

```python
STORAGE_DIR: Path = Path(os.getenv("STORAGE_DIR", "instance/storage"))
```

**Действия:**
1. Добавить регистрацию VectorService в container
2. Добавить STORAGE_DIR в конфиг
3. Реализовать `get_vector_service()`

---

### Шаг 7: Milestone Service

**Создать:** `backend/services/milestone_service.py`

```python
from pathlib import Path
from datetime import datetime
from backend.domain.vectors import Site
from backend.storage.file_storage import FileVectorStorage
import json

class MilestoneService:
    def __init__(self, file_storage: FileVectorStorage):
        self._file_storage = file_storage
    
    def create_milestone(self, site: Site, description: str = None) -> str:
        """Создать веху из текущего состояния Site"""
        timestamp = datetime.now().strftime("%Y%m%dT%H%M%SZ")
        milestone_id = f"milestone_{timestamp}"
        
        # Путь к файлу вехи
        milestones_dir = (
            self._file_storage._root /
            "projects" / site.projectId /
            "sites" / site.siteId /
            "milestones"
        )
        milestones_dir.mkdir(parents=True, exist_ok=True)
        
        milestone_path = milestones_dir / f"{milestone_id}.json"
        
        # Сохранить снэпшот
        milestone_data = {
            "milestoneId": milestone_id,
            "projectId": site.projectId,
            "siteId": site.siteId,
            "timestamp": datetime.now().isoformat(),
            "description": description,
            "version": site.version,
            "site": site.to_dict()
        }
        
        with open(milestone_path, 'w', encoding='utf-8') as f:
            json.dump(milestone_data, f, indent=2, ensure_ascii=False)
        
        return milestone_id
```

**Добавить endpoint:** `POST /api/vector/{site_id}/milestone`

**Действия:**
1. Создать `MilestoneService`
2. Реализовать `create_milestone()`: создать снэпшот → сохранить в milestones/
3. Добавить endpoint в routes.py

---

### Шаг 8: Export Service

**Создать:** `backend/services/export_service.py`

```python
from lxml import etree
import ezdxf
from io import BytesIO
from backend.domain.vectors import Site

class ExportService:
    def export_to_landxml(self, site: Site) -> str:
        """Экспорт в LandXML 1.2"""
        root = etree.Element(
            "LandXML",
            xmlns="http://www.landxml.org/schema/LandXML-1.2",
            version="1.2",
            date=datetime.now().strftime("%Y-%m-%d"),
            time=datetime.now().strftime("%H:%M:%S")
        )
        
        # Units
        units = etree.SubElement(root, "Units")
        imperial = etree.SubElement(units, "Imperial")
        imperial.set("linearUnit", "foot")
        imperial.set("areaUnit", "squareFoot")
        imperial.set("angularUnit", "decimal degrees")
        
        # Project
        project = etree.SubElement(root, "Project")
        project.set("name", site.name)
        
        # Parcels - экспортируем все GeometryLayers
        parcels_elem = etree.SubElement(root, "Parcels")
        parcels_elem.set("name", site.name)
        
        for geometry_layer in site.geometryLayers:
            if not geometry_layer.visible:
                continue  # Пропускаем невидимые слои
            
            for parcel in geometry_layer.parcels:
            parcel_elem = etree.SubElement(parcels_elem, "Parcel")
            parcel_elem.set("name", parcel.name)
            parcel_elem.set("area", str(parcel.area))
            
            coord_geom = etree.SubElement(parcel_elem, "CoordGeom")
            
            for segment in parcel.geometry.segments:
                if segment.segmentType == "line":
                    line = etree.SubElement(coord_geom, "Line")
                    line.set("dir", str(segment.get("bearing", 0)))
                    line.set("length", str(segment.get("length", 0)))
                    
                    start = etree.SubElement(line, "Start")
                    start.text = f"{segment['start']['x']} {segment['start']['y']}"
                    
                    end = etree.SubElement(line, "End")
                    end.text = f"{segment['end']['x']} {segment['end']['y']}"
                
                elif segment.segmentType == "arc":
                    curve = etree.SubElement(coord_geom, "Curve")
                    curve.set("crvType", "arc")
                    curve.set("radius", str(segment.get("radius", 0)))
                    curve.set("delta", str(segment.get("delta", 0)))
                    curve.set("rot", segment.get("rot", "cw"))
                    
                    start = etree.SubElement(curve, "Start")
                    start.text = f"{segment['start']['x']} {segment['start']['y']}"
                    
                    end = etree.SubElement(curve, "End")
                    end.text = f"{segment['end']['x']} {segment['end']['y']}"
                    
                    center = etree.SubElement(curve, "Center")
                    center.text = f"{segment['center']['x']} {segment['center']['y']}"
        
        xml_string = etree.tostring(
            root,
            xml_declaration=True,
            encoding='UTF-8',
            pretty_print=True
        )
        
        return xml_string.decode('utf-8')
    
    def export_to_dxf(self, site: Site) -> bytes:
        """Экспорт в DXF - каждый GeometryLayer как отдельный слой DXF"""
        doc = ezdxf.new('R2010')
        msp = doc.modelspace()
        
        for geometry_layer in site.geometryLayers:
            # Создать слой DXF для каждого GeometryLayer
            layer = doc.layers.add(
                name=geometry_layer.name or geometry_layer.geometryLayerType,
                dxfattribs={'color': 7}  # Белый по умолчанию
            )
            
            # Установить видимость слоя
            layer.on = geometry_layer.visible
            
            for parcel in geometry_layer.parcels:
                points = []
                for segment in parcel.geometry.segments:
                    points.append((segment.start['x'], segment.start['y']))
                # Закрыть полигон если нужно
                if parcel.geometry.isClosed and len(points) > 0:
                    points.append(points[0])
                
                if len(points) >= 2:
                    msp.add_lwpolyline(points, dxfattribs={'layer': layer.dxf.name})
        
        stream = BytesIO()
        doc.save(stream)
        return stream.getvalue()
```

**Добавить endpoints:** 
- `GET /api/vector/{site_id}/export?format=landxml`
- `GET /api/vector/{site_id}/export?format=dxf`

**Действия:**
1. Установить зависимости: `pip install lxml ezdxf`
2. Создать `ExportService`
3. Реализовать `export_to_landxml()`: построить XML структуру
4. Реализовать `export_to_dxf()`: создать DXF документ
5. Добавить endpoints в routes.py
6. Сохранять экспорты в `exports/` директорию

---

### Шаг 9: Интеграция с фронтендом

**Обновить:** `frontend/src/pages/drafter/main.js`

```javascript
// Добавить функцию сохранения векторов
async function saveVectorAction(action, data) {
  const response = await fetch('/api/vector/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectId: currentProjectId,
      siteId: currentSiteId,
      geometryLayerId: currentGeometryLayerId,
      geometryLayerType: currentGeometryLayerType,
      name: currentSiteName,
      action: action,
      data: data
    })
  });
  
  const result = await response.json();
  if (result.success) {
    console.log(`Version ${result.version} saved`);
  }
}

// Вызывать при изменении геометрии
geometryViewer.on('geometry_changed', (event) => {
  saveVectorAction('modify_segment', event.data);
});

// Загрузка текущего состояния при старте
async function loadCurrentSite() {
  const response = await fetch(`/api/vector/${currentSiteId}`);
  const siteData = await response.json();
  geometryViewer.loadData(siteData);
}

// Загрузка конкретного GeometryLayer
async function loadGeometryLayer(geometryLayerId) {
  const response = await fetch(`/api/vector/${currentSiteId}/layer/${geometryLayerId}`);
  const layerData = await response.json();
  geometryViewer.loadLayerData(layerData);
}
```

**Обновить кнопки экспорта в:** `templates/drafter.html`

```javascript
// Экспорт XML
document.getElementById('export-xml').addEventListener('click', async () => {
  const response = await fetch(`/api/vector/${currentSiteId}/export?format=landxml`);
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `site_${currentSiteId}.xml`;
  a.click();
});
```

**Действия:**
1. Добавить функцию `saveVectorAction()` для отправки изменений
2. Подключить к событиям изменения геометрии
3. Добавить загрузку текущего состояния при старте
4. Обновить кнопки экспорта для скачивания файлов

---

## 5. Зависимости

**Установить:**
```bash
pip install lxml ezdxf
```

**Для фронтенда:** Ничего дополнительного (используем Fetch API)

---

## 6. Порядок реализации

1. **Доменные модели** (Шаг 1)
2. **In-Memory хранилище** (Шаг 2)
3. **File Storage** (Шаг 4)
4. **Vector Service** (Шаг 3)
5. **Container** (Шаг 6)
6. **API Routes** (Шаг 5)
7. **Milestone Service** (Шаг 7)
8. **Export Service** (Шаг 8)
9. **Интеграция фронтенда** (Шаг 9)

---

## 7. Тестирование

**Unit тесты:**
- `VectorService.save_vector_action()`
- `VectorService.undo()`
- `ExportService.export_to_landxml()`

**Integration тесты:**
- `POST /api/vector/save` → `GET /api/vector/{site_id}`
- `POST /api/vector/save` → `GET /api/vector/{site_id}/layer/{geometry_layer_id}`
- `POST /api/vector/{site_id}/undo` → проверка версии
- `GET /api/vector/{site_id}/export?format=landxml` → валидный XML
- `GET /api/vector/{site_id}/export?format=dxf` → проверка слоев DXF для каждого GeometryLayer
