"""
Main service class for Fantasy Football standings calculations
"""

import logging
from typing import List, Dict, Any

from .calculator import StandingsCalculator
from .data_cache import DataCache
from .storage import StandingsStorage

logger = logging.getLogger(__name__)


class StandingsService:
    """
    Main service for calculating and storing "vs everyone" fantasy football standings
    """
    
    def __init__(self, dynamodb_tables: Dict[str, Any]):
        self.calculator = StandingsCalculator()
        self.data_cache = DataCache(dynamodb_tables['league_data'])
        self.storage = StandingsStorage(
            dynamodb_tables['weekly_standings'],
            dynamodb_tables['overall_standings']
        )
        logger.info("StandingsService initialized")
    
    def calculate_standings(
        self,
        matchups: List[Dict[str, Any]],
        league_id: str,
        season: str,
        include_player_details: bool = True,
    ) -> List[Dict[str, Any]]:
        team_names = self.data_cache.get_team_names(league_id, season)
        players_data = (
            self.data_cache.get_players_data(league_id, season)
            if include_player_details
            else None
        )
        return self.calculator.calculate_weekly_vs_everyone(matchups, team_names, players_data)
    
    def calculate_and_store(self, matchups: List[Dict[str, Any]], league_id: str, season: str, week: int, include_player_details: bool = True) -> List[Dict[str, Any]]:
        weekly_results = self.calculate_standings(
            matchups,
            league_id,
            season,
            include_player_details,
        )
        if not weekly_results:
            logger.warning("No weekly results to store")
            return []
        self.storage.store_weekly_standings(weekly_results, league_id, season, week)
        self.storage.update_overall_standings(league_id, season)
        return weekly_results
