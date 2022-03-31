import express, { Express, Response, Request, NextFunction } from 'express';
import axios from 'axios';
import { createClient } from 'redis';

const redisClient = createClient();

redisClient.on('error', (err) => {
    console.error(err);
})

const app: Express = express();

const URL = 'http://universities.hipolabs.com/search?country='

type University = {
    country: string,
    name: string,
    domains: string[],
    alpha_two_code: string,
    'state-province': string,
    web_pages: string[],
}

interface TimedRequest extends Request {
    startTime?: number,
    cached?: University[],
}

const findUnis = (uni: string, universities?: University[]) => {
    let unis = universities?.filter(
        u => u.name.toLowerCase() === uni.toLowerCase(),
    )

    return unis;
}

app.use('/', (req: TimedRequest, res: Response, next: NextFunction) => {
    req.startTime = Date.now();
    next();
})

app.get(
    '/universities/:country',
    async (req: TimedRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { country } = req.params;
            const cached = await redisClient.get(country);
            req.cached = JSON.parse(cached ? cached : '[]') as University[];
    
            next();
        } catch (e) {
            console.error(e);
            res.status(500).end();
        }
    },
);

app.get(
    '/universities/:country',
    async (req: TimedRequest, res: Response, next: NextFunction): Promise<void> => {
        try {
            const { university } = req.query;
            const { country } = req.params;
            let unis: University[]|undefined;

            unis = findUnis(university as string, req.cached);
            if (!unis?.length) {
                const response = await axios.get(URL + country);
                const universities = response.data as University[];

                redisClient.set(country, JSON.stringify(universities), { EX: 10000 });

                unis = findUnis(university as string, universities);
            }
            res.status(200).json(unis);
        } catch (e) {
            console.error((e as Error).message);
            res.status(500).end();
        } finally {
            next();
        }
});

app.use('/', (req: TimedRequest, res: Response, next: NextFunction) => {
    if (req.startTime) {
        const elapsedTime = Date.now() - req.startTime;
        console.log(`Requisicao durou: ${elapsedTime}ms`);
    }
});

(async () => {
    await redisClient.connect();
    app.listen(3000, () => console.log('Running on port 3000'));
})();