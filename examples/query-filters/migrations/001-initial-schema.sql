-- Up 
CREATE TABLE Category (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE Post (id INTEGER PRIMARY KEY, 
                   categoryId INTEGER, 
                   title TEXT, 
                   subtitle TEXT,
                   content TEXT,
  CONSTRAINT Post_fk_categoryId FOREIGN KEY (categoryId)
    REFERENCES Category (id) ON UPDATE CASCADE ON DELETE CASCADE);
INSERT INTO Category (id, name) VALUES (1, 'Technology');
 
INSERT INTO POST (id, categoryId, title, subtitle, content) 
    VALUES (1, 1, "Using GraphQL", "Advanced Use cases", "TODO");

INSERT INTO POST (id, categoryId, title, subtitle, content) 
    VALUES (2, 1, "GraphQL Performance", "Effective patterns", "TODO");

-- Down 

DROP TABLE Category;
DROP TABLE Post;