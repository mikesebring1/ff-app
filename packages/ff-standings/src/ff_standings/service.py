"""
Main service class for Fantasy Football standings calculations
"""

import logging
import requests
from typing import List, Dict, Any, Optional

from .calculator import StandingsCalculator
from .data_cache import DataCache
from .storage import StandingsStorage

logger = logging.getLogger(__name__)


class StandingsService:
    """
    Main service for calculating and storing "vs everyone" fantasy football standings
    """
    
    def __init__(self, dynamodb_tables: Dict[str, Any], enable_persistent_cache: bool = False):
        self.league_data_table = dynamodb_tables['league_data']
        self.calculator = StandingsCalculator()
        self.data_cache = DataCache(self.league_data_table, enable_persistent_cache)
        self.storage = StandingsStorage(
            dynamodb_tables['weekly_standings'],
            dynamodb_tables['overall_standings']
        )
        self.enable_persistent_cache = enable_persistent_cache
        logger.info(f"StandingsService initialized (persistent_cache={enable_persistent_cache})")
    
    def load_cache(self) -> None:
        if self.enable_persistent_cache:
            self.data_cache.load_all_cache()
        else:
            logger.debug("Persistent cache disabled, skipping cache load")
    
    def get_week_matchups(self, season: str, week: int) -> Optional[List[Dict[str, Any]]]:
        try:
            response = self.league_data_table.get_item(
                Key={'data_type': 'matchups', 'id': f'{season}_{week}'}
            )
            if 'Item' in response:
                matchups = response['Item']['data']
                logger.info(f"Retrieved {len(matchups)} matchups for week {week}")
                return matchups
            return None
        except Exception as e:
            logger.error(f"Error getting matchups for week {week}: {e}")
            return None
    
    def determine_current_week(self) -> int:
        try:
            response = requests.get('https://api.sleeper.app/v1/state/nfl', timeout=10)
            response.raise_for_status()
            nfl_state = response.json()
            return nfl_state.get('week', 1)
        except Exception as e:
            logger.error(f"Error determining current week: {e}")
            return 1
    
    def calculate_standings(
        self,
        matchups: List[Dict[str, Any]],
        include_player_details: bool = True,
    ) -> List[Dict[str, Any]]:
        team_names = self.data_cache.get_team_names()
        players_data = self.data_cache.get_players_data() if include_player_details else None
        return self.calculator.calculate_weekly_vs_everyone(matchups, team_names, players_data)
    
    def calculate_and_store(self, matchups: List[Dict[str, Any]], season: str, week: int, include_player_details: bool = True) -> List[Dict[str, Any]]:
        weekly_results = self.calculate_standings(matchups, include_player_details)
        if not weekly_results:
            logger.warning("No weekly results to store")
            return []
        self.storage.store_weekly_standings(weekly_results, season, week)
        self.storage.update_overall_standings(season)
        return weekly_results
    
    def process_week_from_db(self, season: str, week: int, include_player_details: bool = True) -> Optional[List[Dict[str, Any]]]:
        matchups = self.get_week_matchups(season, week)
        if not matchups:
            return None
        return self.calculate_and_store(matchups, season, week, include_player_details)
    
    def process_current_week(self, season: str, include_player_details: bool = True) -> Optional[List[Dict[str, Any]]]:
        current_week = self.determine_current_week()
        logger.info(f"Processing current week: {current_week}")
        return self.process_week_from_db(season, current_week, include_player_details)

