import { prisma } from '../config/database';

export async function findActiveEvent() {
  return prisma.event.findFirst({
    where: { isActive: true },
    include: {
      ticketTypes: {
        orderBy: { price: 'asc' },
      },
    },
  });
}

export async function findEventById(id: string) {
  return prisma.event.findUnique({
    where: { id },
    include: {
      ticketTypes: {
        orderBy: { price: 'asc' },
      },
    },
  });
}
