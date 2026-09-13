"""
Access to player and team-name data cached in DynamoDB
"""

import logging
import boto3
from typing import Dict, Any

logger = logging.getLogger(__name__)


class DataCache:
    def __init__(self, league_data_table):
        self.league_data_table = league_data_table
    
    def get_players_data(self, league_id: str, season: str) -> Dict[str, Any]:
        """Get the single-item filtered player map."""
        logger.info("Loading players data from DynamoDB...")
        try:
            response = self.league_data_table.get_item(
                Key={
                    'data_type': 'players',
                    'id': 'nfl_players'
                }
            )
            
            if 'Item' not in response:
                raise ValueError("No players data found in DynamoDB")
            
            item = response['Item']
            if item.get('league_id') != league_id or item.get('season') != season:
                raise ValueError(
                    f"Cached players do not match league {league_id}, season {season}"
                )
            players_data = item['data']
            
            # Log info about the data we loaded
            storage_strategy = item.get('storage_strategy', 'unknown')
            player_count = item.get('player_count', len(players_data))
            filtering_info = item.get('filtering_info', {})
            
            logger.info(f"Loaded {player_count} players (strategy: {storage_strategy})")
            if filtering_info:
                original_count = filtering_info.get('original_count', 'unknown')
                logger.info(f"Filtered from {original_count} total players")
            
            return players_data
            
        except Exception as e:
            logger.error(f"Error loading players data: {e}")
            raise
    
    def get_team_names(self, league_id: str, season: str) -> Dict[str, str]:
        """Get team names mapping with caching"""
        logger.info("Loading team names from DynamoDB...")
        team_names = {}
        
        try:
            # Get rosters (roster_id -> user_id mapping)
            rosters_response = self.league_data_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('data_type').eq('rosters'),
                FilterExpression=(
                    boto3.dynamodb.conditions.Attr('league_id').eq(league_id)
                    & boto3.dynamodb.conditions.Attr('season').eq(season)
                )
            )
            
            roster_to_user = {}
            for item in rosters_response['Items']:
                roster_data = item['data']
                roster_id = str(roster_data['roster_id'])
                user_id = roster_data.get('owner_id')
                if user_id:
                    roster_to_user[roster_id] = user_id
            
            # Get users (user_id -> display_name mapping)
            users_response = self.league_data_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('data_type').eq('users'),
                FilterExpression=(
                    boto3.dynamodb.conditions.Attr('league_id').eq(league_id)
                    & boto3.dynamodb.conditions.Attr('season').eq(season)
                )
            )
            
            user_to_name = {}
            for item in users_response['Items']:
                user_data = item['data']
                user_id = user_data['user_id']
                # Use display_name if available, otherwise username, otherwise "Team {user_id}"
                metadata = user_data.get('metadata', {})
                display_name = (
                    metadata.get('team_name') or 
                    user_data.get('display_name') or 
                    user_data.get('username') or 
                    f"Team {user_id}"
                )
                user_to_name[user_id] = display_name
            
            # Build final mapping
            for roster_id, user_id in roster_to_user.items():
                if user_id in user_to_name:
                    team_names[roster_id] = user_to_name[user_id]
                else:
                    team_names[roster_id] = f"Team {roster_id}"
            
            logger.info(f"Loaded {len(team_names)} team names")
            return team_names
            
        except Exception as e:
            logger.error(f"Error loading team names: {e}")
            return {}
