import axios from 'axios';
import express, { Express, Response, Request, NextFunction } from 'express';
import { createClient } from 'redis';

const redisClient = createClient();

redisClient.on('error', (err) => {
    console.log(err);
})

interface TimedRequest extends Request {
    startTime?: number,
    cached?: University[],
}

const app: Express = express();

type University = {
    country: string,
    name: string,
    domains: string[],
    alpha_two_code: string,
    'state-province': string|null,
    web_pages: string[],
}

const UNIVERSITIES_URL = `http://universities.hipolabs.com/search?country=`

const findUni = (uni: string, universities: University[]|undefined) => {
    const result = universities?.filter(
        u => u.name.toLowerCase() === uni.toLowerCase(),
    );

    return result;
}

app.use('/', async (req: TimedRequest, res: Response, next: NextFunction): Promise<void> => {
    req.startTime = Date.now();
    next();
});

app.get('/universities/:country', async (req: TimedRequest, res: Response, next: NextFunction) => {
    try {
        const { country } = req.params;
        const cached = await redisClient.get(country);
        req.cached = JSON.parse(cached ? cached : '[]') as University[];

        next();
    } catch (e) {
        res.status(500).send({message: (e as Error).message})
    }
});


app.get('/universities/:country', async (req: TimedRequest, res: Response, next: NextFunction) => {
    try {
        const { university } = req.query;
        const { country } = req.params;
        let universities: University[];
        let foundUnis: University[]|undefined;

        foundUnis = findUni(university as string, req.cached);
        if (!req.cached || foundUnis?.length === 0) {
            const response = await axios.get(UNIVERSITIES_URL + country);
            universities = response.data as University[];
            redisClient.set(country, JSON.stringify(universities)); // nao aguardo o retorno

            foundUnis = findUni(university as string, universities);
        } 
        res.status(200).json(foundUnis);
    } catch (e) {
        console.error(e);
        res.status(500).json({message: 'something went wrong.'})
    } finally {
        next();
    }
})

app.use('/', async (req: TimedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (req.startTime) {
        const timeDiff = Date.now() - req.startTime;
        console.log('Time elapsed: ' + timeDiff + 'ms');
    };
});

(async () => {
    redisClient.connect();
    app.listen(3000, () => console.log('Running on port 3000'));
})();