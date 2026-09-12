"""
DynamoDB storage operations for standings data
"""

import logging
import boto3
from decimal import Decimal
from typing import List, Dict, Any

logger = logging.getLogger(__name__)


def scan_all(table, **scan_arguments):
    """Read every DynamoDB scan page using the returned continuation key."""
    items = []
    request = dict(scan_arguments)
    while True:
        response = table.scan(**request)
        items.extend(response.get('Items', []))
        continuation_key = response.get('LastEvaluatedKey')
        if not continuation_key:
            return items
        request['ExclusiveStartKey'] = continuation_key


class StandingsStorage:
    def __init__(self, weekly_standings_table, overall_standings_table):
        self.weekly_standings_table = weekly_standings_table
        self.overall_standings_table = overall_standings_table
    
    def convert_floats_to_decimal(self, obj):
        if isinstance(obj, float):
            return Decimal(str(obj))
        elif isinstance(obj, dict):
            return {key: self.convert_floats_to_decimal(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [self.convert_floats_to_decimal(item) for item in obj]
        else:
            return obj
    
    def store_weekly_standings(self, weekly_results: List[Dict[str, Any]], league_id: str, season: str, week: int) -> None:
        season_week = f"{season}_{week}"
        for result in weekly_results:
            try:
                self.weekly_standings_table.put_item(Item=self.convert_floats_to_decimal({
                    'season_week': season_week,
                    'team_id': result['roster_id'],
                    'league_id': league_id,
                    'rank': result['rank'],
                    'team_name': result['team_name'],
                    'points': result['points'],
                    'wins': result['wins'],
                    'losses': result['losses'],
                    'roster': result['roster']
                }))
            except Exception as e:
                logger.error(f"Error storing weekly result for {result['team_name']}: {e}")
                raise
        logger.info(f"Stored weekly standings for week {week}")
    
    def update_overall_standings(self, league_id: str, season: str) -> None:
        try:
            all_weeks = scan_all(
                self.weekly_standings_table,
                FilterExpression=(
                    boto3.dynamodb.conditions.Attr('season_week').begins_with(f'{season}_')
                    & boto3.dynamodb.conditions.Attr('league_id').eq(league_id)
                )
            )
            team_totals = {}
            for item in all_weeks:
                team_id = item['team_id']
                team_name = item['team_name']
                wins = float(item['wins'])      # Keep fractional wins
                losses = float(item['losses'])  # Keep fractional losses
                points = float(item['points'])
                rank = float(item['rank'])      # Keep fractional ranks too
                if team_id not in team_totals:
                    team_totals[team_id] = {
                        'team_name': team_name,
                        'total_wins': 0.0,      # Use float to support fractional wins
                        'total_losses': 0.0,    # Use float to support fractional losses
                        'total_points': 0.0,
                        'top_finishes': 0
                    }
                team_totals[team_id]['total_wins'] += wins
                team_totals[team_id]['total_losses'] += losses
                team_totals[team_id]['total_points'] += points
                if rank == 1:
                    team_totals[team_id]['top_finishes'] += 1
            for team_id, totals in team_totals.items():
                total_games = totals['total_wins'] + totals['total_losses']
                win_percentage = totals['total_wins'] / total_games if total_games > 0 else 0
                # Store earnings as a numeric value; frontend can render currency
                earnings_numeric = totals['top_finishes'] * 25
                
                # Preserve existing playoff percentage (don't reset to 0)
                try:
                    existing_item = self.overall_standings_table.get_item(
                        Key={'season': season, 'team_id': team_id}
                    )
                    existing_playoff_percentage = existing_item.get('Item', {}).get('playoff_percentage', Decimal('0'))
                except Exception as e:
                    logger.warning(f"Could not retrieve existing playoff percentage for {team_id}: {e}")
                    existing_playoff_percentage = Decimal('0')
                
                self.overall_standings_table.put_item(Item=self.convert_floats_to_decimal({
                    'season': season,
                    'team_id': team_id,
                    'league_id': league_id,
                    'team_name': totals['team_name'],
                    'total_wins': totals['total_wins'],
                    'total_losses': totals['total_losses'],
                    'total_points': Decimal(str(totals['total_points'])),
                    'win_percentage': Decimal(str(round(win_percentage, 4))),
                    'earnings': earnings_numeric,
                    'playoff_percentage': existing_playoff_percentage  # Preserve existing value
                }))
            logger.info(f"Updated overall standings for {len(team_totals)} teams")
        except Exception as e:
            logger.error(f"Error updating overall standings: {e}")
            raise
