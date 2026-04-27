export const creds = `
      CREATE TABLE IF NOT EXISTS creds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token TEXT UNIQUE NOT NULL,
          wallet TEXT UNIQUE NOT NULL,
          repo_hash TEXT UNIQUE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
export const branches = `
      CREATE TABLE IF NOT EXISTS branches (
          branch_id INTEGER PRIMARY KEY AUTOINCREMENT,
          branch_name TEXT UNIQUE NOT NULL,
          branch_hash TEXT UNIQUE NOT NULL,
          current BOOLEAN NOT NULL DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `;
export const burns = `
      CREATE TABLE IF NOT EXISTS burns (
          burn_id INTEGER PRIMARY KEY AUTOINCREMENT,
          burn_hash TEXT UNIQUE NOT NULL,
          description TEXT,
          author TEXT DEFAULT SWAGAT, 
          parent_burn_hash TEXT,
          branch_id INTEGER NOT NULL,
          weights_id INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (branch_id) REFERENCES branches(branch_id),
          FOREIGN KEY (weights_id) REFERENCES weights(weights_id)
      );
    `;
export const metrics = `
        CREATE TABLE IF NOT EXISTS metrics (
            metrics_id INTEGER PRIMARY KEY AUTOINCREMENT,
            burn_hash TEXT UNIQUE NOT NULL,
            architecture TEXT NOT NULL,
            accuracy REAL,
            loss REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (burn_hash) REFERENCES burns(burn_hash)
        );
      `;
export const weights = `
    CREATE TABLE IF NOT EXISTS weights (
      weights_id INTEGER PRIMARY KEY AUTOINCREMENT,
      weights_hash TEXT NOT NULL,
      weights_file TEXT NOT NULL, 
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    `;
export const misc = `
    CREATE TABLE IF NOT EXISTS misc (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_path TEXT NOT NULL,
      model_instance TEXT NOT NULL 
    );
`;
