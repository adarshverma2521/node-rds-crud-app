# Node + RDS (MySQL) CRUD App — EC2 Deployment Notes

## 1) Fill your .env
Copy `.env.example` to `.env` and fill with your RDS details.

## 2) Install & run locally (optional)
```bash
npm install
npm start
```

## 3) Systemd service (example)
Save as `/etc/systemd/system/nodeapp.service`:
```ini
[Unit]
Description=Node RDS CRUD App
After=network.target

[Service]
EnvironmentFile=/opt/node-rds/.env
WorkingDirectory=/opt/node-rds
ExecStart=/usr/bin/node /opt/node-rds/app.js
Restart=always
User=ec2-user
Group=ec2-user

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now nodeapp
sudo systemctl status nodeapp
```

## 4) Nginx reverse proxy (optional, to serve on port 80)
```bash
sudo dnf install -y nginx
sudo tee /etc/nginx/conf.d/nodeapp.conf >/dev/null <<'NGINX'
server {
  listen 80 default_server;
  server_name _;
  location / {
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_pass http://127.0.0.1:3000;
  }
}
NGINX
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
```
