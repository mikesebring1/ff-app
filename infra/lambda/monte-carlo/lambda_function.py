#!/usr/bin/env python3
"""
Monte Carlo Playoff Simulation Lambda for Fantasy Football vs Everyone

This Lambda function runs vectorized Monte Carlo simulations to calculate playoff percentages.
It uses shrinkage-based sampling for more realistic early-season predictions.
"""

import json
import os
import logging
from collections import defaultdict
import boto3
from decimal import Decimal
import numpy as np

from ff_utils.league_context import resolve_league_context_from_env

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """Main Lambda handler for Monte Carlo simulation"""
    logger.info("Starting Monte Carlo playoff simulation...")
    
    try:
        # Initialize the Monte Carlo service
        service = MonteCarloService()
        
        # Run the simulation
        result = service.run()
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Monte Carlo simulation completed successfully',
                'result': result
            })
        }
        
    except Exception as e:
        logger.error(f"Monte Carlo simulation failed: {e}")
        raise

class MonteCarloService:
    def __init__(self):
        """Initialize the Monte Carlo simulation service"""
        self.num_simulations = 10000
        
        # AWS clients
        self.dynamodb = boto3.resource('dynamodb')
        
        # DynamoDB tables
        self.league_data_table = self.dynamodb.Table(os.environ['LEAGUE_DATA_TABLE'])
        self.weekly_standings_table = self.dynamodb.Table(os.environ['WEEKLY_STANDINGS_TABLE'])
        self.overall_standings_table = self.dynamodb.Table(os.environ['OVERALL_STANDINGS_TABLE'])
        
        logger.info("Monte Carlo service initialized")

    def get_team_mapping(self, league_id, season):
        """Get team ID to name mapping"""
        try:
            users_response = self.league_data_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('data_type').eq('users'),
                FilterExpression=(
                    boto3.dynamodb.conditions.Attr('league_id').eq(league_id)
                    & boto3.dynamodb.conditions.Attr('season').eq(season)
                )
            )
            roster_response = self.league_data_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('data_type').eq('rosters'),
                FilterExpression=(
                    boto3.dynamodb.conditions.Attr('league_id').eq(league_id)
                    & boto3.dynamodb.conditions.Attr('season').eq(season)
                )
            )

            if not users_response.get('Items'):
                logger.warning("No cached user data found")
                return {}
            if not roster_response.get('Items'):
                logger.warning("No cached roster data found")
                return {}
            
            # Build mapping: roster_id -> user_id -> display_name
            roster_to_user = {}
            for item in roster_response['Items']:
                roster = item['data']
                roster_id = str(roster['roster_id'])
                user_id = roster.get('owner_id')
                if user_id:
                    roster_to_user[roster_id] = user_id
            
            # Build user_id -> display_name mapping
            user_to_name = {}
            for item in users_response['Items']:
                user_data = item['data']
                user_id = user_data['user_id']
                display_name = (
                    user_data.get('metadata', {}).get('team_name') or
                    user_data.get('display_name') or
                    f"Team {user_id}"
                )
                user_to_name[user_id] = display_name
            
            # Build final mapping
            team_names = {}
            for roster_id, user_id in roster_to_user.items():
                if user_id in user_to_name:
                    team_names[roster_id] = user_to_name[user_id]
                else:
                    team_names[roster_id] = f"Team {roster_id}"
            
            return team_names
            
        except Exception as e:
            logger.error(f"Error getting team mapping: {e}")
            return {}

    def get_completed_weeks_data(self, league_id, season, current_week):
        """Get all completed weekly standings data"""
        try:
            completed_weeks = list(range(1, current_week))
            
            if not completed_weeks:
                logger.warning("No completed weeks found")
                return {}
            
            # Get all weekly standings for completed weeks
            all_weeks_data = {}
            
            for week in completed_weeks:
                response = self.weekly_standings_table.query(
                    KeyConditionExpression=boto3.dynamodb.conditions.Key('season_week').eq(f'{season}_{week}'),
                    FilterExpression=boto3.dynamodb.conditions.Attr('league_id').eq(league_id)
                )
                
                week_data = {}
                for item in response['Items']:
                    team_id = item['team_id']
                    points = float(item['points'])
                    week_data[team_id] = points
                
                if week_data:
                    all_weeks_data[week] = week_data
            
            logger.info(f"Retrieved data for {len(all_weeks_data)} completed weeks")
            return all_weeks_data
            
        except Exception as e:
            logger.error(f"Error getting completed weeks data: {e}")
            return {}

    def build_score_pools(self, weeks_data):
        """Build team-specific and league-wide score pools for shrinkage sampling"""
        team_score_pools = defaultdict(list)
        league_score_pool = []
        
        # Get all team IDs
        all_teams = set()
        for week_data in weeks_data.values():
            all_teams.update(week_data.keys())
        
        logger.info(f"Building score pools for {len(all_teams)} teams")
        
        # Build team-specific pools (only their own scores)
        for team_id in all_teams:
            for week, week_data in weeks_data.items():
                if team_id in week_data:
                    team_score = week_data[team_id]
                    team_score_pools[team_id].append(team_score)
        
        # Build league-wide pool (all scores from all teams)
        for week, week_data in weeks_data.items():
            for team_id, score in week_data.items():
                league_score_pool.append(score)
        
        # Log pool sizes
        for team_id, scores in team_score_pools.items():
            logger.debug(f"Team {team_id}: {len(scores)} historical scores")
        
        logger.info(f"Built pools: {len(team_score_pools)} teams, {len(league_score_pool)} league scores")
        return team_score_pools, league_score_pool

    def calculate_dynamic_lambda(self, completed_weeks, total_weeks=15):
        """Dynamic lambda that decreases over the season using inverse square root"""
        start_lambda = 50
        end_lambda = 3
        progress = completed_weeks / (total_weeks - 1)
        decay_factor = 1 - np.sqrt(progress)
        return start_lambda - (start_lambda - end_lambda) * decay_factor

    def simulate_remaining_season(self, team_score_pools, league_score_pool, current_week, season, league_id):
        """Vectorized Monte Carlo simulation using NumPy with dynamic lambda and noise"""
        remaining_weeks = list(range(current_week, 16))  # Weeks current through 15 (playoffs start week 16)
        
        if not remaining_weeks:
            logger.info("No remaining weeks to simulate")
            return {}
        
        num_weeks = len(remaining_weeks)
        team_ids = list(team_score_pools.keys())
        num_teams = len(team_ids)
        
        logger.info(f"Vectorized simulation: {num_weeks} weeks, {num_teams} teams, {self.num_simulations} simulations")
        
        # Calculate dynamic shrinkage parameters
        completed_weeks = current_week - 1
        lambda_shrinkage = self.calculate_dynamic_lambda(completed_weeks)
        team_weight = completed_weeks / (completed_weeks + lambda_shrinkage)
        league_weight = lambda_shrinkage / (completed_weeks + lambda_shrinkage)
        
        logger.info(f"Dynamic shrinkage: lambda={lambda_shrinkage:.1f}, team={team_weight:.3f}, league={league_weight:.3f}")
        
        # Convert score pools to NumPy arrays for efficient sampling
        team_arrays = {}
        league_array = np.array(league_score_pool)
        
        for team_id in team_ids:
            if team_id in team_score_pools and team_score_pools[team_id]:
                team_arrays[team_id] = np.array(team_score_pools[team_id])
            else:
                # Fallback to league average if no team data
                team_arrays[team_id] = league_array
        
        # Vectorized simulation: shape = (simulations, teams, weeks)
        logger.info("Generating vectorized samples...")
        
        # Generate all random samples at once
        team_samples = np.zeros((self.num_simulations, num_teams, num_weeks))
        league_samples = np.random.choice(league_array, size=(self.num_simulations, num_teams, num_weeks))
        
        # Sample from each team's historical scores
        for i, team_id in enumerate(team_ids):
            team_samples[:, i, :] = np.random.choice(
                team_arrays[team_id], 
                size=(self.num_simulations, num_weeks)
            )
        
        # Apply shrinkage formula vectorized
        simulated_scores = team_weight * team_samples + league_weight * league_samples
        
        # Add noise to account for week-to-week variance
        league_std = np.std(league_array)
        score_variance = league_std * 0.15  # 15% of league standard deviation
        noise = np.random.normal(0, score_variance, simulated_scores.shape)
        simulated_scores += noise
        simulated_scores = np.maximum(0, simulated_scores)  # Ensure non-negative
        
        logger.info(f"Added noise with variance: {score_variance:.2f} (15% of league std: {league_std:.2f})")
        
        logger.info("Calculating rankings and wins/losses...")
        
        # Calculate season totals
        season_wins = np.zeros((self.num_simulations, num_teams))
        
        # For each week, calculate rankings and wins
        for week_idx in range(num_weeks):
            week_scores = simulated_scores[:, :, week_idx]  # Shape: (simulations, teams)
            
            # Get rankings for each simulation (higher score = better rank)
            rankings = np.argsort(-week_scores, axis=1)  # Descending order
            ranks = np.argsort(rankings, axis=1) + 1  # Convert to 1-based ranks
            
            # Calculate wins for this week: wins = total_teams - rank
            week_wins = num_teams - ranks
            season_wins += week_wins
        
        # Get current standings
        current_standings = self.get_current_season_standings(season, league_id)
        
        # Add current wins to simulated wins
        current_wins = np.array([
            current_standings.get(team_id, {'total_wins': 0})['total_wins'] 
            for team_id in team_ids
        ])
        
        final_wins = season_wins + current_wins[np.newaxis, :]  # Broadcast current wins
        
        logger.info("Determining playoff teams...")
        
        # Count playoff appearances (top 4 teams by wins for each simulation)
        playoff_counts = np.zeros(num_teams)
        
        # For each simulation, find top 4 teams
        for sim in range(self.num_simulations):
            top_4_indices = np.argsort(-final_wins[sim])[:4]  # Top 4 by wins
            playoff_counts[top_4_indices] += 1
        
        # Calculate percentages
        playoff_percentages = {}
        for i, team_id in enumerate(team_ids):
            percentage = (playoff_counts[i] / self.num_simulations) * 100
            playoff_percentages[team_id] = round(percentage, 1)
        
        logger.info("Vectorized Monte Carlo simulation completed")
        return playoff_percentages

    def get_current_season_standings(self, season, league_id):
        """Get current season standings"""
        try:
            response = self.overall_standings_table.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('season').eq(season),
                FilterExpression=boto3.dynamodb.conditions.Attr('league_id').eq(league_id)
            )
            
            standings = {}
            for item in response['Items']:
                team_id = item['team_id']
                standings[team_id] = {
                    'total_wins': int(item.get('total_wins', 0)),
                    'total_losses': int(item.get('total_losses', 0))
                }
            
            return standings
            
        except Exception as e:
            logger.error(f"Error getting current standings: {e}")
            return {}

    def update_playoff_percentages(self, playoff_percentages, team_names, league_id, season):
        """Update the overall standings table with playoff percentages"""
        try:
            logger.info("Updating playoff percentages in database...")
            
            for team_id, percentage in playoff_percentages.items():
                team_name = team_names.get(team_id, f"Team {team_id}")
                
                # Update the existing overall standings record
                self.overall_standings_table.update_item(
                    Key={
                        'season': season,
                        'team_id': team_id
                    },
                    UpdateExpression=(
                        'SET playoff_percentage = :percentage, league_id = :league_id'
                    ),
                    ExpressionAttributeValues={
                        ':percentage': Decimal(str(percentage)),
                        ':league_id': league_id,
                    },
                    ReturnValues='UPDATED_NEW'
                )
                
                logger.info(f"Updated {team_name} playoff percentage: {percentage}%")
            
            logger.info("Successfully updated all playoff percentages")
            
        except Exception as e:
            logger.error(f"Error updating playoff percentages: {e}")
            raise

    def run(self):
        """Main simulation execution"""
        try:
            league_context = resolve_league_context_from_env()
            season = league_context['season']
            current_week = league_context['week']
            league_id = league_context['league_id']
            
            # Get team mapping
            team_names = self.get_team_mapping(league_id, season)
            
            # Get completed weeks data
            weeks_data = self.get_completed_weeks_data(league_id, season, current_week)
            
            if not weeks_data:
                raise RuntimeError("No completed weeks data found")
            
            # Build score pools for shrinkage sampling
            team_score_pools, league_score_pool = self.build_score_pools(weeks_data)
            
            if not team_score_pools or not league_score_pool:
                raise RuntimeError("No score pools could be built")
            
            # Run Monte Carlo simulation using shrinkage sampling
            playoff_percentages = self.simulate_remaining_season(
                team_score_pools,
                league_score_pool,
                current_week,
                season,
                league_id,
            )
            
            # Update database with results
            self.update_playoff_percentages(
                playoff_percentages,
                team_names,
                league_id,
                season,
            )
            
            logger.info("Monte Carlo simulation completed successfully")
            return {
                'playoff_percentages': playoff_percentages,
                'teams_simulated': len(playoff_percentages),
                'simulations_run': self.num_simulations
            }
            
        except Exception as e:
            logger.error(f"Monte Carlo simulation failed: {e}")
            raise
