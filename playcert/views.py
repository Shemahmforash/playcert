from pyramid.view import view_config
from pyechonest import config, song, artist
import os
import eventful
import redis
import datetime
import json
import logging
import re
import sys

log = logging.getLogger(__name__)

config.ECHO_NEST_API_KEY = os.environ['ECHONEST_KEY']
api = eventful.API(os.environ['EVENTFUL_KEY'])
redisClient = redis.StrictRedis(host='localhost', port=6379, db=0)


@view_config(route_name='home', renderer='templates/mytemplate.pt')
def my_view(request):
    return {'project': 'playcert'}


@view_config(route_name='events', renderer='templates/events.pt')
def events_view(request):
    today = datetime.date.today()
    location = 'Lisbon'
    events_redis_key = location + '.events.' + str(today)

    log.debug('Location %s', location)

    # get events from redis
    events = redisClient.get(events_redis_key)
    events = json.loads(events) if events else ''
    if not events:
        # or get the events from the eventful api
        events = api.call(
            '/events/search', c='music', l=location, date='This week'
        )
        log.debug('api response: %s', events)

        events = process_events(events)
        log.debug('processed_events: %s', events)

        # and set them on redis
        redisClient.set(events_redis_key, json.dumps(events))

    log.debug('songs: %s', events['songs'])

    playlist = generate_playlist(events['songs'])

    log.debug('Playlist: %s', playlist)

    return {
        'events': events['events'],
        'songs': events['songs'],
        'playlist': playlist
    }


def generate_playlist(songs):
    """ Creates a playlist string to be rendered
    """
    # just use the foreign id from songs
    ids = []
    for s in songs:
        ids.append(s['foreign_id'])

    ids = ','.join(ids)

    # remove reference to spotify:track
    pattern = re.compile('spotify\:track\:')
    ids = pattern.sub('', ids)

    return ids


def filter_songs(songs, artist):
    """Filters songs retrieving just the important fields
    """

    filtered_songs = []
    for s in songs:
        track = s.get_tracks('spotify-WW')[0]

        simple_song = {'title': s.title, 'foreign_id': track[
            'foreign_id'], 'artist': artist}
        filtered_songs.append(simple_song)

    return filtered_songs


def find_artist(event):
    if isinstance(event['performers'], dict):
        return event[
            'performers']['performer']['name']

    # get artist from echonest api
    try:
        event_artist = artist.extract(text=event['title'], results=1)
    except:
        log.error('could not find artist %s', sys.exc_info()[0])
        return

    log.debug('Event artist from echonest: %s', event_artist)
    if event_artist:
        return event_artist[0].name

    return


def process_events(events):
    """ Transforms the events returned from the
     eventful api in something meaningful
    """
    processed = []
    global_songs = []

    for event in events['events']['event']:
        event_processed = {}
        event_processed['title'] = event['title']
        event_processed['venue'] = event['venue_name']
        event_processed['when'] = event['start_time']
        event_processed['artist'] = ''
        event_processed['songs'] = ''

        event_artist = find_artist(event)

        if event_artist:
            event_processed['artist'] = event_artist

            # get artist songs from redis hash
            songs = redisClient.hget('artist.songs', event_processed['artist'])
            songs = json.loads(songs) if songs else ''

            if not songs:
                # or use the echonest api to find songs for an artist
                try:
                    echonest_songs = song.search(artist=event_processed['artist'], buckets=[
                                                 'id:spotify-WW', 'tracks'], limit=True, results=1)
                except:
                    log.error(
                        'could not find songs in echonest %s', sys.exc_info()[0])

                if echonest_songs:
                    # filter song data
                    simplified_songs = filter_songs(
                        echonest_songs, event_processed['artist'])

                    event_processed['songs'] = simplified_songs
                    global_songs = global_songs + simplified_songs

                    # set the artist songs on a redis hash
                    redisClient.hset(
                        'artist.songs',
                        event_processed['artist'],
                        json.dumps(simplified_songs)
                    )
            else:
                global_songs = songs
                event_processed['songs'] = songs

        processed.append(event_processed)

    return {'events': processed, 'songs': global_songs}
