# Seeding by Game Version

To maintain and import SQL data easily across several versions, organize files in versioned subdirectories.

## 📁 Structure
```text
apps/server/seeds/
  ├── v0.1.0/
  │     └── items.sql
  ├── v0.2.0/
  │     └── recipes.sql
```

## 🏃‍♂️ Execution
Use full relative path linking into and point wrangler at D1 name:

```bash
npm run db:seed ./seeds/v0.1.0/items.sql
```
