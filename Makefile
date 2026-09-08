# Raccourcis d'exploitation. `make install` est l'equivalent de ./install.sh.

SHELL := /bin/bash
DC := docker compose

.DEFAULT_GOAL := help
.PHONY: help install up down restart logs ps test test-watch build pull seed purge smoke clean

help: ## Affiche cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Installation complete en une commande (build, up, migrations, seed, smoke test)
	@./install.sh

up: ## Demarre la stack
	@$(DC) up -d

down: ## Arrete la stack (les donnees sont conservees)
	@$(DC) down

restart: ## Redemarre l'API et le front
	@$(DC) restart api web

logs: ## Suit les logs de tous les services
	@$(DC) logs -f --tail=100

ps: ## Etat des services
	@$(DC) ps

build: ## Reconstruit les images applicatives
	@$(DC) build api web

pull: ## Tire les images depuis le registre (aucune compilation locale)
	@./install.sh --pull

test: ## Lance les tests Jest du backend
	@cd backend && npm test

test-watch: ## Tests Jest en mode watch
	@cd backend && npm run test:watch

seed: ## Rejoue le jeu de donnees de demonstration
	@$(DC) exec -T api node dist/seed.js

purge: ## Declenche immediatement un passage du reaper (purge des demandes echues)
	@$(DC) exec -T api node -e "\
	const { NestFactory } = require('@nestjs/core'); \
	const { AppModule } = require('./dist/app.module'); \
	const { ReaperService } = require('./dist/reaper/reaper.service'); \
	NestFactory.createApplicationContext(AppModule, { logger: false }) \
	  .then(async (app) => { \
	    console.log(JSON.stringify(await app.get(ReaperService).runOnce())); \
	    await app.close(); \
	  });"

smoke: ## Rejoue uniquement le smoke test du parcours
	@./install.sh 2>/dev/null | sed -n '/smoke test/,$$p'

clean: ## Arrete la stack ET supprime les volumes (donnees perdues)
	@read -p "Supprimer definitivement les donnees (base et objets) ? [y/N] " ok; \
	[ "$$ok" = "y" ] && $(DC) down -v || echo "Annule."
