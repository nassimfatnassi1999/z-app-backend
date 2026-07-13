COMPOSE=docker compose
DB_SERVICE=postgres
-include .env
export DATABASE_URL=postgresql://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@localhost:5432/$(POSTGRES_DB)
POSTGRES_USER?=postgres
POSTGRES_DB?=zdb

.PHONY: dev stop reset-db logs wait-db prod-deploy prod-stop prod-undeploy prod-monitor prod-menu doctor validate-env

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
	cd deploy && ./deploy.sh

prod-stop:
	cd deploy && ./stop.sh

prod-undeploy:
	cd deploy && ./undeploy.sh

prod-monitor:
	cd deploy && ./monitor.sh

prod-menu:
	cd deploy && ./manage.sh

validate-env:
	./scripts/validate-env.sh .env
	./scripts/check-env-example.sh .env .env.example

doctor:
	cd deploy && ./doctor.sh
