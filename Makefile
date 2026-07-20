COMPOSE=docker compose
DB_SERVICE=postgres
PROD_ENV?=$(CURDIR)/.env
-include .env
export DATABASE_URL=postgresql://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@localhost:5432/$(POSTGRES_DB)
POSTGRES_USER?=postgres
POSTGRES_DB?=zdb

.PHONY: dev stop reset-db logs wait-db validate-local-env doctor \
	prod-deploy prod-stop prod-undeploy prod-monitor prod-menu \
	validate-env build-backend start-postgres wait-postgres verify-database \
	repair-database-permissions run-migrations start-backend wait-backend show-status \
	prod-db-diagnose prod-db-repair prod-backend-diagnose prod-healthcheck

dev:
	$(COMPOSE) up -d $(DB_SERVICE)
	$(MAKE) wait-db
	npx prisma migrate deploy
	npx prisma generate
	npm run start:dev

wait-db:
	@until $(COMPOSE) exec -T $(DB_SERVICE) pg_isready -U $(POSTGRES_USER) -d $(POSTGRES_DB) >/dev/null 2>&1; do \
		echo "Waiting for PostgreSQL..."; \
		sleep 1; \
	done

stop:
	$(COMPOSE) stop

reset-db:
	$(COMPOSE) down -v
	$(COMPOSE) up -d $(DB_SERVICE)
	$(MAKE) wait-db
	npx prisma migrate deploy
	npx prisma generate

logs:
	$(COMPOSE) logs -f $(DB_SERVICE)

prod-deploy:
	$(MAKE) validate-env
	# Production images are always rebuilt from scratch; no cached layers are reused.
	$(MAKE) build-backend
	$(MAKE) start-postgres
	$(MAKE) wait-postgres
	$(MAKE) verify-database
	$(MAKE) repair-database-permissions
	$(MAKE) run-migrations
	$(MAKE) start-backend
	$(MAKE) wait-backend
	$(MAKE) show-status
	# Clean BuildKit after a successful deployment so cache disk usage cannot continuously increase.
	docker builder prune -af

validate-env:
	cd deploy && Z_PROD_ENV_FILE="$(PROD_ENV)" ./deploy.sh validate-env

build-backend:
	cd deploy && Z_PROD_ENV_FILE="$(PROD_ENV)" ./deploy.sh build-backend

start-postgres:
	cd deploy && Z_PROD_ENV_FILE="$(PROD_ENV)" ./deploy.sh start-postgres

wait-postgres:
	cd deploy && Z_PROD_ENV_FILE="$(PROD_ENV)" ./deploy.sh wait-postgres

verify-database:
	cd deploy && Z_PROD_ENV_FILE="$(PROD_ENV)" ./deploy.sh verify-database

repair-database-permissions:
	cd deploy && Z_PROD_ENV_FILE="$(PROD_ENV)" ./deploy.sh repair-database-permissions

run-migrations:
	cd deploy && Z_PROD_ENV_FILE="$(PROD_ENV)" ./deploy.sh run-migrations

start-backend:
	cd deploy && Z_PROD_ENV_FILE="$(PROD_ENV)" ./deploy.sh start-backend

wait-backend:
	cd deploy && Z_PROD_ENV_FILE="$(PROD_ENV)" ./deploy.sh wait-backend

show-status:
	cd deploy && Z_PROD_ENV_FILE="$(PROD_ENV)" ./deploy.sh show-status

prod-db-diagnose:
	cd deploy && Z_PROD_ENV_FILE="$(PROD_ENV)" ./deploy.sh diagnose

prod-backend-diagnose:
	cd deploy && Z_PROD_ENV_FILE="$(PROD_ENV)" ./deploy.sh backend-diagnose

prod-healthcheck:
	cd deploy && Z_PROD_ENV_FILE="$(PROD_ENV)" ./deploy.sh healthcheck

prod-db-repair:
	$(MAKE) validate-env
	$(MAKE) start-postgres
	$(MAKE) wait-postgres
	$(MAKE) verify-database
	$(MAKE) repair-database-permissions

prod-stop:
	cd deploy && Z_PROD_ENV_FILE="$(PROD_ENV)" ./stop.sh

prod-undeploy:
	cd deploy && Z_PROD_ENV_FILE="$(PROD_ENV)" ./undeploy.sh

prod-monitor:
	cd deploy && Z_PROD_ENV_FILE="$(PROD_ENV)" ./monitor.sh

prod-menu:
	cd deploy && Z_PROD_ENV_FILE="$(PROD_ENV)" ./manage.sh

validate-local-env:
	./scripts/validate-env.sh .env
	./scripts/check-env-example.sh .env .env.example

doctor:
	cd deploy && Z_PROD_ENV_FILE="$(PROD_ENV)" ./doctor.sh
